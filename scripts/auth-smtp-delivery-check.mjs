import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

const generatedAt = new Date();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.AUTH_SMTP_DELIVERY_TIMEZONE ?? "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(generatedAt);
const outputBase = process.env.AUTH_SMTP_DELIVERY_OUTPUT_BASE ?? join("data", "ops", `auth-smtp-delivery-${day}`);
const evidenceLevel = process.env.AUTH_SMTP_DELIVERY_EVIDENCE_LEVEL ?? "local";
const smtpHost = process.env.AUTH_SMTP_DELIVERY_SMTP_HOST ?? process.env.SMTP_HOST ?? "";
const smtpPort = Number(process.env.AUTH_SMTP_DELIVERY_SMTP_PORT ?? process.env.SMTP_PORT ?? 587);
const smtpSecure = /^(1|true|yes)$/i.test(process.env.AUTH_SMTP_DELIVERY_SMTP_SECURE ?? process.env.SMTP_SECURE ?? "false");
const smtpUser = process.env.AUTH_SMTP_DELIVERY_SMTP_USER ?? process.env.SMTP_USER ?? "";
const smtpPassword = process.env.AUTH_SMTP_DELIVERY_SMTP_PASSWORD ?? process.env.SMTP_PASSWORD ?? "";
const smtpFrom = process.env.AUTH_SMTP_DELIVERY_SMTP_FROM ?? process.env.SMTP_FROM ?? "";
const recipient = process.env.AUTH_SMTP_DELIVERY_TO ?? "";
const nonce = randomUUID();
const checks = [];
const report = {
  generatedAt: generatedAt.toISOString(),
  status: "RUNNING",
  evidenceLevel,
  smtpHost,
  smtpHostKind: hostKind(smtpHost),
  smtpPort,
  smtpSecure,
  smtpFrom,
  recipient,
  nonce,
  checks,
  messageId: "",
  accepted: [],
  rejected: [],
  response: "",
  error: null
};

function hostKind(host) {
  const normalized = String(host ?? "").trim().toLowerCase();
  if (!normalized) return "missing";
  if (normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::1" || normalized.endsWith(".localhost")) {
    return "loopback";
  }
  if (/^127\./.test(normalized)) return "loopback";
  return "external";
}

function addCheck(name, status, detail = "") {
  checks.push({ name, status, detail });
  if (status === "FAIL") throw new Error(`${name}: ${detail}`);
}

function validateConfig() {
  addCheck("SMTP_HOST", smtpHost ? "PASS" : "FAIL", smtpHost ? report.smtpHostKind : "missing");
  addCheck("SMTP_PORT", Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort <= 65535 ? "PASS" : "FAIL", String(smtpPort));
  addCheck("SMTP_FROM", smtpFrom ? "PASS" : "FAIL", smtpFrom ? "present" : "missing");
  addCheck("AUTH_SMTP_DELIVERY_TO", recipient ? "PASS" : "FAIL", recipient ? "present" : "missing");
  if (evidenceLevel === "production" && report.smtpHostKind !== "external") {
    addCheck("production SMTP host", "FAIL", `smtpHostKind=${report.smtpHostKind}`);
  }
}

function markdownTable(rows) {
  if (rows.length === 0) return "_No checks._\n";
  return [
    "| check | status | detail |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${String(row.name).replace(/\|/g, "\\|")} | ${row.status} | ${String(row.detail ?? "").replace(/\|/g, "\\|")} |`)
  ].join("\n") + "\n";
}

function writeReport() {
  const markdown = [
    `# daily-arxiv Auth SMTP Delivery ${day}`,
    "",
    `Status: ${report.status}`,
    `Generated at: ${report.generatedAt}`,
    `Evidence level: ${report.evidenceLevel}`,
    `SMTP host: ${report.smtpHost}`,
    `SMTP host kind: ${report.smtpHostKind}`,
    `SMTP port: ${report.smtpPort}`,
    `SMTP secure: ${report.smtpSecure}`,
    `SMTP from: ${report.smtpFrom}`,
    `Recipient: ${report.recipient}`,
    `Message ID: ${report.messageId || ""}`,
    `Accepted: ${report.accepted.join(", ")}`,
    `Rejected: ${report.rejected.join(", ")}`,
    report.error ? `Error: ${report.error}` : "",
    "",
    "## Checks",
    markdownTable(report.checks)
  ].filter(Boolean).join("\n");

  mkdirSync(dirname(outputBase), { recursive: true });
  writeFileSync(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${outputBase}.md`, markdown);
  console.log(`Auth SMTP delivery report written: ${outputBase}.md`);
  console.log(`Auth SMTP delivery JSON written: ${outputBase}.json`);
}

try {
  validateConfig();
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser
      ? {
          user: smtpUser,
          pass: smtpPassword || undefined
        }
      : undefined
  });

  await transporter.verify();
  checks.push({ name: "SMTP verify", status: "PASS", detail: "server accepted connection" });
  const result = await transporter.sendMail({
    from: smtpFrom,
    to: recipient,
    subject: `daily-arxiv auth SMTP delivery check ${day}`,
    text: [
      "daily-arxiv auth SMTP delivery check",
      `Generated at: ${generatedAt.toISOString()}`,
      `Nonce: ${nonce}`
    ].join("\n")
  });
  report.messageId = result.messageId ?? "";
  report.accepted = (result.accepted ?? []).map(String);
  report.rejected = (result.rejected ?? []).map(String);
  report.response = result.response ?? "";
  if (report.accepted.length === 0) throw new Error("SMTP send did not report any accepted recipients");
  checks.push({ name: "SMTP send", status: "PASS", detail: `${report.accepted.length} accepted recipient(s)` });
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
} finally {
  writeReport();
}

if (report.status !== "PASS") {
  process.exit(1);
}
