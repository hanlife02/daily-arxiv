import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const evidenceDir = process.env.PROD_EVIDENCE_DIR ?? "data/ops";
const allowIncomplete = /^(1|true|yes)$/i.test(process.env.PROD_EVIDENCE_ALLOW_INCOMPLETE ?? "");
const maxEvidenceAgeDays = Math.max(0, Math.floor(Number(process.env.PROD_EVIDENCE_MAX_AGE_DAYS ?? 14)));
const generatedAt = new Date();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.PROD_EVIDENCE_TIMEZONE ?? "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(generatedAt);
const outputBase = process.env.PROD_EVIDENCE_OUTPUT_BASE ?? join(evidenceDir, `prod-evidence-audit-${day}`);

function listFiles() {
  if (!existsSync(evidenceDir)) return [];
  return readdirSync(evidenceDir)
    .map((name) => ({ name, path: join(evidenceDir, name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function latestFile(pattern) {
  return listFiles().filter((file) => pattern.test(file.name)).at(-1);
}

function artifactDate(file) {
  return file.name.match(/-(\d{4}-\d{2}-\d{2})\.(?:json|md)$/)?.[1] ?? "";
}

function dateDistanceDays(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function stale(item, file) {
  const date = artifactDate(file);
  if (!date) return fail(item, file, "artifact date is missing");
  const ageDays = dateDistanceDays(date, day);
  if (ageDays < 0) return fail(item, file, `artifact date is in the future: ${date}`);
  if (ageDays > maxEvidenceAgeDays) {
    return fail(item, file, `artifact is ${ageDays} days old; max allowed is ${maxEvidenceAgeDays}`);
  }
  return null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file.path, "utf8"));
}

function readText(file) {
  return readFileSync(file.path, "utf8");
}

function mdEscape(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function table(headers, rows) {
  if (rows.length === 0) return "_No rows._\n";
  return [
    `| ${headers.map(mdEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`)
  ].join("\n") + "\n";
}

const evidenceNextActions = {
  "registration verification local capture smoke": "Run pnpm smoke:auth-email and archive auth-email-smoke-YYYY-MM-DD.json.",
  "auth SMTP production delivery": "Run AUTH_SMTP_DELIVERY_TO=... AUTH_SMTP_DELIVERY_EVIDENCE_LEVEL=production pnpm prod:auth-smtp with real external SMTP.",
  "production readiness live probe": "Run PROD_READINESS_LIVE_PROBE=1 pnpm prod:readiness against the HTTPS production URL.",
  "7-day production trial": "Run OPS_DAILY_CHECK_EVIDENCE_LEVEL=production pnpm ops:daily-check daily for 7 days, then run pnpm ops:trial-summary.",
  "supplier and PDF failure samples": "Run OPS_FAILURE_SAMPLE_EVIDENCE_LEVEL=production OPS_FAILURE_SAMPLE_LLM_BASE_URL=... pnpm ops:failure-samples against a real provider endpoint.",
  "LLM billing reconciliation": "Run OPS_LLM_BILLING_EVIDENCE_LEVEL=production OPS_LLM_BILLING_EXPORT=... pnpm ops:llm-billing-reconcile with a real provider export.",
  "restore app local smoke": "Run pnpm restore:app-smoke and archive restore-app-smoke-YYYY-MM-DD.json.",
  "production restore app smoke": "Run RESTORE_APP_SMOKE_EVIDENCE_LEVEL=production pnpm restore:app-smoke in the target environment."
};

function nextAction(item, status) {
  return status === "PASS" ? "" : evidenceNextActions[item] ?? "";
}

function pass(item, file, detail) {
  return { item, status: "PASS", file: file?.name ?? "", detail, nextAction: nextAction(item, "PASS") };
}

function fail(item, file, detail) {
  return { item, status: "FAIL", file: file?.name ?? "", detail, nextAction: nextAction(item, "FAIL") };
}

function missing(item, detail) {
  return { item, status: "MISSING", file: "", detail, nextAction: nextAction(item, "MISSING") };
}

function isLoopbackUrl(value) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost"
      || hostname === "0.0.0.0"
      || hostname === "::1"
      || hostname.endsWith(".localhost")
      || /^127\./.test(hostname);
  } catch {
    return false;
  }
}

function auditProdReadiness() {
  const file = latestFile(/^prod-readiness-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) return missing("production readiness live probe", "prod-readiness-YYYY-MM-DD.json not found");
  const staleResult = stale("production readiness live probe", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.status !== "PASS") return fail("production readiness live probe", file, `status=${data.status}`);
    if (data.liveProbe !== true) return fail("production readiness live probe", file, "liveProbe is not enabled");
    if (data.allowLoopback === true) return fail("production readiness live probe", file, "loopback was allowed");
    const failedChecks = (data.checks ?? []).filter((check) => check.status === "fail");
    if (failedChecks.length > 0) {
      return fail("production readiness live probe", file, `${failedChecks.length} failed checks`);
    }
    return pass("production readiness live probe", file, "PASS with liveProbe=true");
  } catch (error) {
    return fail("production readiness live probe", file, error instanceof Error ? error.message : String(error));
  }
}

function auditTrialSummary() {
  const jsonFile = latestFile(/^trial-summary-\d{4}-\d{2}-\d{2}\.json$/);
  if (jsonFile) {
    const staleResult = stale("7-day production trial", jsonFile);
    if (staleResult) return staleResult;
    try {
      const data = readJson(jsonFile);
      if (data.status !== "PASS") return fail("7-day production trial", jsonFile, `status=${data.status ?? "unknown"}`);
      if (data.evidenceLevel !== "production") {
        return fail("7-day production trial", jsonFile, `evidenceLevel=${data.evidenceLevel ?? "missing"}`);
      }
      const dailyRows = Array.isArray(data.dailyEvidence) ? data.dailyEvidence.length : 0;
      if (dailyRows < 7) return fail("7-day production trial", jsonFile, `only ${dailyRows} daily evidence rows`);
      if (Array.isArray(data.missingDates) && data.missingDates.length > 0) {
        return fail("7-day production trial", jsonFile, `${data.missingDates.length} missing dates`);
      }
      const nonProductionRows = (data.dailyEvidence ?? []).filter((row) => row.evidenceLevel !== "production");
      if (nonProductionRows.length > 0) {
        return fail("7-day production trial", jsonFile, `${nonProductionRows.length} non-production daily evidence rows`);
      }
      return pass("7-day production trial", jsonFile, `${dailyRows} daily evidence rows`);
    } catch (error) {
      return fail("7-day production trial", jsonFile, error instanceof Error ? error.message : String(error));
    }
  }

  const file = latestFile(/^trial-summary-\d{4}-\d{2}-\d{2}\.md$/);
  if (!file) return missing("7-day production trial", "trial-summary-YYYY-MM-DD.json not found");
  const staleResult = stale("7-day production trial", file);
  if (staleResult) return staleResult;
  return fail("7-day production trial", file, "JSON trial summary with evidenceLevel=production is required");
}

function auditFailureSamples() {
  const file = latestFile(/^failure-samples-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) return missing("supplier and PDF failure samples", "failure-samples-YYYY-MM-DD.json not found");
  const staleResult = stale("supplier and PDF failure samples", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    const probes = Array.isArray(data.probes) ? data.probes : [];
    const pdf = probes.find((probe) => probe.kind === "pdf");
    const llm = probes.find((probe) => probe.kind === "llm");
    if (data.evidenceLevel !== "production") {
      return fail("supplier and PDF failure samples", file, `evidenceLevel=${data.evidenceLevel ?? "missing"}`);
    }
    if (!pdf) return fail("supplier and PDF failure samples", file, "missing PDF probe");
    if (pdf.ok !== false) return fail("supplier and PDF failure samples", file, "PDF probe did not capture a failure");
    if (!llm) return fail("supplier and PDF failure samples", file, "missing LLM probe");
    if (llm.skipped) return fail("supplier and PDF failure samples", file, "LLM provider probe was skipped");
    if (!llm.url) return fail("supplier and PDF failure samples", file, "missing LLM provider URL");
    if (isLoopbackUrl(llm.url)) return fail("supplier and PDF failure samples", file, "LLM probe uses loopback endpoint");
    if (llm.ok !== false) return fail("supplier and PDF failure samples", file, "LLM probe did not capture a failure");
    return pass("supplier and PDF failure samples", file, "production PDF and LLM failure probes captured");
  } catch (error) {
    return fail("supplier and PDF failure samples", file, error instanceof Error ? error.message : String(error));
  }
}

function auditBillingReconcile() {
  const file = latestFile(/^llm-billing-reconcile-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) return missing("LLM billing reconciliation", "llm-billing-reconcile-YYYY-MM-DD.json not found");
  const staleResult = stale("LLM billing reconciliation", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.evidenceLevel !== "production") {
      return fail("LLM billing reconciliation", file, `evidenceLevel=${data.evidenceLevel ?? "missing"}`);
    }
    if ((data.providerTotal?.calls ?? 0) <= 0) return fail("LLM billing reconciliation", file, "provider usage rows are empty");
    if ((data.localTotal?.calls ?? 0) <= 0) return fail("LLM billing reconciliation", file, "local llm_call_log rows are empty");
    const issueCount = Array.isArray(data.issues) ? data.issues.length : 0;
    return pass("LLM billing reconciliation", file, `${issueCount} reconciliation issues reported`);
  } catch (error) {
    return fail("LLM billing reconciliation", file, error instanceof Error ? error.message : String(error));
  }
}

function auditRestoreLocalSmoke() {
  const file = latestFile(/^restore-app-smoke-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) {
    return missing("restore app local smoke", "restore-app-smoke-YYYY-MM-DD.json not found");
  }
  const staleResult = stale("restore app local smoke", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.status !== "PASS") return fail("restore app local smoke", file, `status=${data.status ?? "unknown"}`);
    return pass("restore app local smoke", file, "PASS");
  } catch (error) {
    return fail("restore app local smoke", file, error instanceof Error ? error.message : String(error));
  }
}

function auditRestoreProductionEvidence() {
  const file = latestFile(/^restore-app-smoke-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) {
    return missing("production restore app smoke", "restore-app-smoke-YYYY-MM-DD.json not found; run and archive a production restore app smoke report");
  }
  const staleResult = stale("production restore app smoke", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.status !== "PASS") return fail("production restore app smoke", file, `status=${data.status ?? "unknown"}`);
    if (data.evidenceLevel !== "production") {
      return fail("production restore app smoke", file, `evidenceLevel=${data.evidenceLevel ?? "missing"}`);
    }
    return pass("production restore app smoke", file, "production restore app smoke passed");
  } catch (error) {
    return fail("production restore app smoke", file, error instanceof Error ? error.message : String(error));
  }
}

function auditAuthEmailSmoke() {
  const file = latestFile(/^auth-email-smoke-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) {
    return missing("registration verification local capture smoke", "auth-email-smoke-YYYY-MM-DD.json not found");
  }
  const staleResult = stale("registration verification local capture smoke", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.status !== "PASS") return fail("registration verification local capture smoke", file, `status=${data.status ?? "unknown"}`);
    const checkNames = new Set((data.checks ?? []).map((check) => check.name));
    for (const required of ["sign-up API", "verification email captured", "verification URL", "database email_verified", "verified user sign-in"]) {
      if (!checkNames.has(required)) return fail("registration verification local capture smoke", file, `missing check: ${required}`);
    }
    return pass("registration verification local capture smoke", file, "local SMTP capture sign-up, verification callback, and sign-in passed");
  } catch (error) {
    return fail("registration verification local capture smoke", file, error instanceof Error ? error.message : String(error));
  }
}

function auditAuthSmtpDelivery() {
  const file = latestFile(/^auth-smtp-delivery-\d{4}-\d{2}-\d{2}\.json$/);
  if (!file) {
    return missing("auth SMTP production delivery", "auth-smtp-delivery-YYYY-MM-DD.json not found");
  }
  const staleResult = stale("auth SMTP production delivery", file);
  if (staleResult) return staleResult;
  try {
    const data = readJson(file);
    if (data.status !== "PASS") return fail("auth SMTP production delivery", file, `status=${data.status ?? "unknown"}`);
    if (data.evidenceLevel !== "production") {
      return fail("auth SMTP production delivery", file, `evidenceLevel=${data.evidenceLevel ?? "missing"}`);
    }
    if (data.smtpHostKind !== "external") {
      return fail("auth SMTP production delivery", file, `smtpHostKind=${data.smtpHostKind ?? "missing"}`);
    }
    if (!Array.isArray(data.accepted) || data.accepted.length === 0) {
      return fail("auth SMTP production delivery", file, "no accepted recipients");
    }
    return pass("auth SMTP production delivery", file, `${data.accepted.length} accepted recipient(s)`);
  } catch (error) {
    return fail("auth SMTP production delivery", file, error instanceof Error ? error.message : String(error));
  }
}

const results = [
  auditAuthEmailSmoke(),
  auditAuthSmtpDelivery(),
  auditProdReadiness(),
  auditTrialSummary(),
  auditFailureSamples(),
  auditBillingReconcile(),
  auditRestoreLocalSmoke(),
  auditRestoreProductionEvidence()
];
const issues = results.filter((result) => result.status !== "PASS");
const status = issues.length === 0 ? "PASS" : "FAIL";
const payload = {
  generatedAt: generatedAt.toISOString(),
  status,
  evidenceDir,
  maxEvidenceAgeDays,
  results,
  issues: issues.map((issue) => `${issue.item}: ${issue.detail}`)
};
const markdown = [
  `# daily-arxiv Production Evidence Audit ${day}`,
  "",
  `Status: ${status}`,
  `Generated at: ${generatedAt.toISOString()}`,
  `Evidence directory: ${evidenceDir}`,
  `Max evidence age: ${maxEvidenceAgeDays} day(s)`,
  "",
  "## Evidence",
  table(
    ["item", "status", "file", "detail", "next action"],
    results.map((result) => [result.item, result.status, result.file, result.detail, result.nextAction])
  ),
  "## Issues",
  issues.length > 0 ? issues.map((issue) => `- ${issue.item}: ${issue.detail}`).join("\n") + "\n" : "_No issues._\n"
].join("\n");

mkdirSync(dirname(outputBase), { recursive: true });
writeFileSync(`${outputBase}.json`, `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(`${outputBase}.md`, markdown);
console.log(`Production evidence audit written: ${outputBase}.md`);
console.log(`Production evidence audit JSON written: ${outputBase}.json`);

if (status !== "PASS" && !allowIncomplete) {
  process.exit(1);
}
