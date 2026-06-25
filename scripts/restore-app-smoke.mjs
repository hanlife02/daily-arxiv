import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = parseEnvValue(trimmed.slice(index + 1));
  }
  return values;
}

const env = { ...loadDotEnv(), ...process.env };
const composeFile = env.COMPOSE_FILE ?? "docker-compose.yml";
const postgresService = env.RESTORE_APP_SMOKE_POSTGRES_SERVICE ?? "postgres";
const postgresUser = env.RESTORE_APP_SMOKE_POSTGRES_USER ?? "daily_arxiv";
const restoreDb = env.RESTORE_APP_SMOKE_DB ?? env.RESTORE_DRILL_DB ?? "daily_arxiv_restore_drill";
const port = Number(env.RESTORE_APP_SMOKE_PORT ?? 3213);
const appUrl = (env.RESTORE_APP_SMOKE_APP_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
const containerName = env.RESTORE_APP_SMOKE_CONTAINER_NAME ?? "daily-arxiv-restore-app-smoke";
const timeoutSeconds = Number(env.RESTORE_APP_SMOKE_TIMEOUT_SECONDS ?? 180);
const adminEmail = env.ADMIN_EMAIL ?? "admin@example.com";
const adminDomain = adminEmail.split("@")[1] ?? "example.com";
const smokeUserEmail = env.RESTORE_APP_SMOKE_USER_EMAIL ?? `docker-smoke-user@${adminDomain}`;
const smokeUserPassword = env.RESTORE_APP_SMOKE_USER_PASSWORD ?? "docker-smoke-password";
const generatedAt = new Date();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: env.RESTORE_APP_SMOKE_TIMEZONE ?? "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(generatedAt);
const outputBase = env.RESTORE_APP_SMOKE_OUTPUT_BASE ?? join("data", "ops", `restore-app-smoke-${day}`);
const evidenceLevel = env.RESTORE_APP_SMOKE_EVIDENCE_LEVEL ?? "local";
const report = {
  generatedAt: generatedAt.toISOString(),
  status: "RUNNING",
  evidenceLevel,
  restoreDb,
  appUrl,
  smokeUserEmail,
  checks: [],
  error: null
};

function fail(message) {
  throw new Error(message);
}

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  });
}

function dockerCompose(args, options = {}) {
  return docker(["compose", "-f", composeFile, ...args], options);
}

function psql(db, sql) {
  return dockerCompose([
    "exec",
    "-T",
    postgresService,
    "psql",
    "-U",
    postgresUser,
    "-d",
    db,
    "-t",
    "-A",
    "-F",
    "\t",
    "-c",
    sql
  ]).trim();
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cleanupContainer() {
  spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
}

function recordCheck(name, status, detail = "") {
  report.checks.push({ name, status, detail });
}

function writeReport() {
  const markdown = [
    `# daily-arxiv Restore App Smoke ${day}`,
    "",
    `Status: ${report.status}`,
    `Generated at: ${report.generatedAt}`,
    `Evidence level: ${report.evidenceLevel}`,
    `Restore DB: ${restoreDb}`,
    `App URL: ${appUrl}`,
    `Smoke user: ${smokeUserEmail}`,
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
  console.log(`Restore app smoke report written: ${outputBase}.md`);
  console.log(`Restore app smoke JSON written: ${outputBase}.json`);
}

async function expectFetchOk(url, options, label) {
  const response = await fetch(url, options);
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  fail(`${label} failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
}

async function expectText(url, cookieHeader, expected, label) {
  const response = await expectFetchOk(url, {
    headers: { cookie: cookieHeader }
  }, label);
  const html = await response.text();
  if (!html.includes(expected)) {
    fail(`${label} did not contain ${JSON.stringify(expected)}`);
  }
  return html;
}

function cookieHeaderFrom(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function waitForHealth() {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(`${appUrl}/api/health`);
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  fail(`restore app health did not become ready within ${timeoutSeconds}s`);
}

function restoreRowsForSmokeUser() {
  const sql = `
with latest_report as (
  select r.id, r.batch_date, r.latest_version
  from report r
  join "user" u on u.id = r.user_id
  where u.email = ${sqlLiteral(smokeUserEmail)}
  order by r.created_at desc
  limit 1
),
latest_version as (
  select rv.report_id, rv.selected_paper_ids
  from report_version rv
  join latest_report lr on lr.id = rv.report_id and lr.latest_version = rv.version
),
selected_paper as (
  select value as paper_id
  from latest_version lv
  cross join lateral jsonb_array_elements_text(lv.selected_paper_ids)
  limit 1
)
select
  u.id,
  u.email,
  coalesce(lr.id, ''),
  coalesce(sp.paper_id, ''),
  coalesce(p.title, '')
from "user" u
left join latest_report lr on true
left join selected_paper sp on true
left join paper p on p.arxiv_id = sp.paper_id
where u.email = ${sqlLiteral(smokeUserEmail)}
limit 1;
`;
  const output = psql(restoreDb, sql);
  if (!output) {
    fail(`restored smoke user not found: ${smokeUserEmail}`);
  }
  const [userId, email, reportId, paperId, paperTitle] = output.split("\t");
  if (!userId || email !== smokeUserEmail) fail(`restored smoke user query returned unexpected row: ${output}`);
  if (!reportId) fail(`restored smoke user has no report: ${smokeUserEmail}`);
  if (!paperId || !paperTitle) fail(`restored smoke user latest report has no selected paper`);
  return { userId, reportId, paperId, paperTitle };
}

function ensureRestoreDatabaseReady() {
  dockerCompose(["up", "-d", postgresService, "redis"], { stdio: "inherit" });
  psql(restoreDb, "select 1;");
  recordCheck("restore database", "PASS", restoreDb);
}

function startRestoreApp() {
  cleanupContainer();
  console.log(`==> start restore app smoke container on ${appUrl}`);
  dockerCompose([
    "run",
    "-d",
    "--name",
    containerName,
    "--no-deps",
    "-p",
    `${port}:3000`,
    "-e",
    `DATABASE_URL=postgres://daily_arxiv:daily_arxiv@postgres:5432/${restoreDb}`,
    "-e",
    "REDIS_URL=redis://redis:6379",
    "-e",
    `APP_URL=${appUrl}`,
    "-e",
    `BETTER_AUTH_URL=${appUrl}`,
    "-e",
    "BETTER_AUTH_RATE_LIMIT_ENABLED=false",
    "app",
    "sh",
    "-c",
    "pnpm start"
  ], { stdio: "inherit" });
}

async function signIn() {
  console.log(`==> restore app sign-in: ${smokeUserEmail}`);
  const response = await expectFetchOk(`${appUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: appUrl
    },
    body: new URLSearchParams({ email: smokeUserEmail, password: smokeUserPassword })
  }, "restore app sign-in");
  const cookieHeader = cookieHeaderFrom(response);
  if (!cookieHeader.includes("better-auth.session_token=")) {
    fail("restore app sign-in did not return a Better Auth session cookie");
  }
  recordCheck("restored user sign-in", "PASS", smokeUserEmail);
  return cookieHeader;
}

async function verifyRestoredPages(cookieHeader, restored) {
  console.log("==> verify restored settings page");
  await expectText(`${appUrl}/settings`, cookieHeader, "个人设置", "restored settings page");
  await expectText(`${appUrl}/settings`, cookieHeader, "LLM 配置", "restored LLM settings");
  recordCheck("settings page", "PASS", "personal settings and LLM settings visible");

  console.log("==> verify restored reports page");
  await expectText(`${appUrl}/reports`, cookieHeader, restored.reportId, "restored reports page");
  recordCheck("reports page", "PASS", restored.reportId);

  console.log("==> verify restored report detail");
  await expectText(`${appUrl}/reports/${restored.reportId}`, cookieHeader, restored.paperTitle, "restored report detail");
  recordCheck("report detail", "PASS", restored.paperTitle);

  console.log("==> verify restored read page");
  await expectText(`${appUrl}/read?paper=${encodeURIComponent(restored.paperId)}`, cookieHeader, restored.paperTitle, "restored read page");
  recordCheck("read page", "PASS", restored.paperId);

  console.log("==> verify restored user export");
  const exportResponse = await expectFetchOk(`${appUrl}/api/export/user`, {
    headers: { cookie: cookieHeader }
  }, "restored user export");
  const payload = await exportResponse.json();
  if (payload.user?.email !== smokeUserEmail) fail("restored export user email mismatch");
  if (!payload.preference?.categories?.length) fail("restored export missing user preferences");
  if (payload.llmConfig?.hasApiKey !== true) fail("restored export missing LLM config marker");
  if (!payload.reports?.some((report) => report.id === restored.reportId && report.versions?.length > 0)) {
    fail("restored export missing report versions");
  }
  if (!payload.readingStates?.some((state) => state.paperId === restored.paperId)) {
    fail("restored export missing reading state for selected paper");
  }
  recordCheck("user export", "PASS", "preferences, LLM marker, report versions, reading state");
}

let failed = false;

try {
  ensureRestoreDatabaseReady();
  const restored = restoreRowsForSmokeUser();
  recordCheck("restored smoke user data", "PASS", `${restored.reportId} / ${restored.paperId}`);
  startRestoreApp();
  await waitForHealth();
  recordCheck("restore app health", "PASS", appUrl);
  const cookieHeader = await signIn();
  await verifyRestoredPages(cookieHeader, restored);
  report.status = "PASS";
  console.log("Restore app smoke passed.");
} catch (error) {
  failed = true;
  report.status = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  cleanupContainer();
  writeReport();
}

if (failed) {
  process.exit(1);
}
