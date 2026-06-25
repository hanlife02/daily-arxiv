import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "node:net";

const composeFile = process.env.AUTH_EMAIL_SMOKE_COMPOSE_FILE ?? process.env.COMPOSE_FILE ?? "docker-compose.yml";
const appUrl = (process.env.AUTH_EMAIL_SMOKE_APP_URL ?? process.env.APP_URL ?? "http://localhost:3211").replace(/\/$/, "");
const timeoutSeconds = Number(process.env.AUTH_EMAIL_SMOKE_TIMEOUT_SECONDS ?? 180);
const smokeDomain = process.env.AUTH_EMAIL_SMOKE_DOMAIN ?? "auth-smoke.test";
const smokeEmail = process.env.AUTH_EMAIL_SMOKE_EMAIL ?? `auth-smoke-${randomUUID()}@${smokeDomain}`;
const smokePassword = process.env.AUTH_EMAIL_SMOKE_PASSWORD ?? `AuthSmoke-${randomUUID()}-Password1`;
const smokeName = process.env.AUTH_EMAIL_SMOKE_NAME ?? "Auth Email Smoke";
const smtpFrom = process.env.AUTH_EMAIL_SMOKE_SMTP_FROM ?? `Daily arXiv <noreply@${smokeDomain}>`;
const generatedAt = new Date();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.AUTH_EMAIL_SMOKE_TIMEZONE ?? "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(generatedAt);
const outputBase = process.env.AUTH_EMAIL_SMOKE_OUTPUT_BASE ?? join("data", "ops", `auth-email-smoke-${day}`);
const messages = [];
const report = {
  generatedAt: generatedAt.toISOString(),
  status: "RUNNING",
  evidenceLevel: process.env.AUTH_EMAIL_SMOKE_EVIDENCE_LEVEL ?? "local",
  smtpMode: "capture",
  appUrl,
  smokeDomain,
  smokeEmail,
  checks: [],
  error: null
};

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env
  });
}

function dockerCompose(args, options = {}) {
  return run("docker", ["compose", "-f", composeFile, ...args], options);
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psql(sql) {
  return dockerCompose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "daily_arxiv",
    "-d",
    "daily_arxiv",
    "-t",
    "-A",
    "-c",
    sql
  ]).trim();
}

function writeLine(socket, line) {
  socket.write(`${line}\r\n`);
}

async function startSmtpCaptureServer() {
  const server = createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    let data = "";
    let current = { from: "", recipients: [] };

    writeLine(socket, "220 daily-arxiv auth smoke smtp");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const raw = buffer.slice(0, index + 1);
        buffer = buffer.slice(index + 1);
        const line = raw.replace(/\r?\n$/, "");

        if (dataMode) {
          if (line === ".") {
            messages.push({ ...current, raw: data });
            data = "";
            current = { from: "", recipients: [] };
            dataMode = false;
            writeLine(socket, "250 message accepted");
          } else {
            data += `${line}\n`;
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          writeLine(socket, "250-daily-arxiv-auth-smoke");
          writeLine(socket, "250 8BITMIME");
        } else if (upper.startsWith("MAIL FROM:")) {
          current.from = line.slice("MAIL FROM:".length).trim();
          writeLine(socket, "250 sender ok");
        } else if (upper.startsWith("RCPT TO:")) {
          current.recipients.push(line.slice("RCPT TO:".length).trim());
          writeLine(socket, "250 recipient ok");
        } else if (upper === "DATA") {
          dataMode = true;
          writeLine(socket, "354 end with <CR><LF>.<CR><LF>");
        } else if (upper === "RSET") {
          current = { from: "", recipients: [] };
          data = "";
          dataMode = false;
          writeLine(socket, "250 reset ok");
        } else if (upper === "QUIT") {
          writeLine(socket, "221 bye");
          socket.end();
        } else {
          writeLine(socket, "250 ok");
        }
      }
    });
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });

  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function waitForAppHealth() {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  fail(`app health did not become ready: ${appUrl}/api/health`);
}

async function waitForMessage() {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const message = messages.find((item) => item.raw.includes(smokeEmail));
    if (message) return message;
    await sleep(500);
  }
  fail(`verification email was not captured for ${smokeEmail}`);
}

function extractVerificationUrl(message) {
  const decoded = message.raw
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  const matches = [...decoded.matchAll(/https?:\/\/[^\s<>"']+\/verify-email\?[^\s<>"']+/g)];
  const urls = matches.map((match) => match[0].replace(/&amp;/g, "&"));
  const url = urls.find((item) => item.startsWith(appUrl));
  if (!url) fail(`verification URL for ${appUrl} not found in captured email`);
  return url;
}

function assertVerificationUrl(url) {
  const parsed = new URL(url);
  const expected = new URL(appUrl);
  if (parsed.origin !== expected.origin || !parsed.pathname.endsWith("/verify-email")) {
    fail(`verification URL does not use the app origin and verify-email endpoint: ${url}`);
  }
}

async function registerUser() {
  const response = await fetch(`${appUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: appUrl
    },
    body: new URLSearchParams({
      name: smokeName,
      email: smokeEmail,
      password: smokePassword
    }),
    redirect: "manual"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    fail(`sign-up failed: HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ""}`);
  }
}

async function verifyEmail(url) {
  const response = await fetch(url, { redirect: "manual" });
  if (![200, 302, 303, 307, 308].includes(response.status)) {
    const text = await response.text().catch(() => "");
    fail(`verify-email failed: HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ""}`);
  }
}

async function signIn() {
  const response = await fetch(`${appUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appUrl
    },
    body: JSON.stringify({
      email: smokeEmail,
      password: smokePassword
    }),
    redirect: "manual"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    fail(`verified user sign-in failed: HTTP ${response.status}${text ? ` ${text.slice(0, 240)}` : ""}`);
  }
  const cookie = response.headers.get("set-cookie") ?? "";
  if (!cookie.includes("better-auth.session_token=")) {
    fail("verified user sign-in did not set a better-auth session cookie");
  }
}

function seedAllowedDomain() {
  psql(`
    insert into allowed_email_domain (id, domain, enabled, created_at)
    values (${sqlLiteral(`auth-smoke-domain-${randomUUID()}`)}, ${sqlLiteral(smokeDomain)}, true, now())
    on conflict (domain) do update set enabled = true
  `);
}

function cleanupSmokeUser() {
  try {
    psql(`delete from "user" where email = ${sqlLiteral(smokeEmail)}`);
  } catch (error) {
    console.warn(`auth email smoke cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function restoreBaseAppContainer() {
  try {
    console.log("==> restore app container without SMTP capture override");
    dockerCompose(["up", "-d", "app"], { stdio: "inherit" });
  } catch (error) {
    console.warn(`auth email smoke app restore failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function recordCheck(name, status, detail = "") {
  report.checks.push({ name, status, detail });
}

function writeReport() {
  const markdown = [
    `# daily-arxiv Auth Email Smoke ${day}`,
    "",
    `Status: ${report.status}`,
    `Generated at: ${report.generatedAt}`,
    `Evidence level: ${report.evidenceLevel}`,
    `SMTP mode: ${report.smtpMode}`,
    `App URL: ${appUrl}`,
    `Smoke domain: ${smokeDomain}`,
    `Smoke email: ${smokeEmail}`,
    report.error ? `Error: ${report.error}` : "",
    "",
    "## Checks",
    report.checks.length > 0
      ? [
          "| check | status | detail |",
          "| --- | --- | --- |",
          ...report.checks.map((check) => `| ${String(check.name).replace(/\|/g, "\\|")} | ${check.status} | ${String(check.detail ?? "").replace(/\|/g, "\\|")} |`)
        ].join("\n")
      : "_No checks recorded._",
    ""
  ].filter(Boolean).join("\n");

  mkdirSync(dirname(outputBase), { recursive: true });
  writeFileSync(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${outputBase}.md`, markdown);
  console.log(`Auth email smoke report written: ${outputBase}.md`);
  console.log(`Auth email smoke JSON written: ${outputBase}.json`);
}

const smtp = await startSmtpCaptureServer();
const overrideDir = mkdtempSync(join(tmpdir(), "daily-arxiv-auth-email-smoke-"));
const overridePath = join(overrideDir, "compose.override.yml");
writeFileSync(overridePath, [
  "services:",
  "  app:",
  "    environment:",
  "      - SMTP_HOST=host.docker.internal",
  `      - SMTP_PORT=${smtp.port}`,
  "      - SMTP_SECURE=false",
  "      - SMTP_USER=",
  "      - SMTP_PASSWORD=",
  `      - SMTP_FROM=${smtpFrom}`,
  "      - BETTER_AUTH_RATE_LIMIT_ENABLED=false"
].join("\n"));

console.log(`==> auth email smoke SMTP capture on host.docker.internal:${smtp.port}`);

let failed = false;

try {
  console.log("==> start app with SMTP capture override");
  run("docker", ["compose", "-f", composeFile, "-f", overridePath, "up", "-d", "--build", "app"], { stdio: "inherit" });
  await waitForAppHealth();
  recordCheck("app health with SMTP capture override", "PASS", appUrl);
  console.log("==> seed allowed registration domain");
  seedAllowedDomain();
  recordCheck("allowed registration domain", "PASS", smokeDomain);
  console.log("==> sign up smoke user");
  await registerUser();
  recordCheck("sign-up API", "PASS", smokeEmail);
  console.log("==> wait for verification email");
  const message = await waitForMessage();
  recordCheck("verification email captured", "PASS", `${message.recipients.length} recipient(s)`);
  const verificationUrl = extractVerificationUrl(message);
  assertVerificationUrl(verificationUrl);
  recordCheck("verification URL", "PASS", new URL(verificationUrl).origin);
  console.log("==> verify email link");
  await verifyEmail(verificationUrl);
  const verified = psql(`select email_verified::text from "user" where email = ${sqlLiteral(smokeEmail)}`);
  if (verified !== "true") fail(`email was not marked verified for ${smokeEmail}`);
  recordCheck("database email_verified", "PASS", "true");
  console.log("==> sign in verified user");
  await signIn();
  recordCheck("verified user sign-in", "PASS", "session cookie issued");
  report.status = "PASS";
  console.log("Auth email smoke passed.");
} catch (error) {
  failed = true;
  report.status = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
} finally {
  cleanupSmokeUser();
  await smtp.close();
  restoreBaseAppContainer();
  writeReport();
}

if (failed) {
  process.exit(1);
}
