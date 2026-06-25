import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const opsDir = process.env.OPS_TRIAL_DIR ?? "data/ops";
const requiredDays = Math.max(1, Math.floor(Number(process.env.OPS_TRIAL_DAYS ?? 7)));
const explicitEndDate = process.env.OPS_TRIAL_END_DATE;
const failOnLlmFailures = !/^(0|false|no)$/i.test(process.env.OPS_TRIAL_FAIL_ON_LLM_FAILURES ?? "true");
const explicitEvidenceLevel = process.env.OPS_TRIAL_EVIDENCE_LEVEL;

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function expectedDates(endDate, days) {
  return Array.from({ length: days }, (_, index) => addDays(endDate, index - days + 1));
}

function parseDailyCheckFileName(name) {
  const match = name.match(/^daily-check-(\d{4}-\d{2}-\d{2})\.(md|json)$/);
  if (!match) return null;
  return { date: match[1], format: match[2] };
}

function section(content, heading) {
  const start = content.indexOf(`## ${heading}`);
  if (start === -1) return "";
  const rest = content.slice(start);
  const next = rest.indexOf("\n## ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function parseTable(content, heading) {
  const lines = section(content, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) return [];
  const headers = lines[0].split("|").slice(1, -1).map((cell) => cell.trim());
  return lines.slice(2).map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/\\\|/g, "|"));
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportStatusFromRows(date, parsed) {
  const issues = [];
  const warnings = [];
  const heartbeats = parsed.heartbeats;
  const jobRows = parsed.jobRows;
  const failureRows = parsed.failureRows;
  const emailRows = parsed.emailRows;
  const llmRows = parsed.llmRows;
  const queueRows = parsed.queueRows;
  const backupRows = parsed.backupRows;
  const databaseRows = parsed.databaseRows;

  for (const heartbeat of heartbeats) {
    if (heartbeat.status === "missing" || heartbeat.status === "unreadable") {
      issues.push(`${date}: heartbeat ${heartbeat.file} is ${heartbeat.status}`);
    }
  }

  for (const job of jobRows) {
    if (job.status === "failed" || job.status === "stalled") {
      issues.push(`${date}: job ${job.type} has ${job.count} ${job.status}`);
    }
  }

  if (failureRows.length > 0) {
    issues.push(`${date}: recent job failures ${failureRows.length}`);
  }

  const aggregateQueue = queueRows.find((row) => "total_backlog" in row);
  if (aggregateQueue) {
    for (const key of ["total_backlog", "total_active", "total_failed", "total_delayed"]) {
      if (numberValue(aggregateQueue[key]) > 0) {
        issues.push(`${date}: queue health ${key}=${aggregateQueue[key]}`);
      }
    }
  }

  if (backupRows.length === 0) {
    issues.push(`${date}: no backup files listed`);
  }

  for (const llm of llmRows) {
    if (llm.status === "failed" && numberValue(llm.calls) > 0) {
      const message = `${date}: LLM ${llm.endpoint} failed calls=${llm.calls}`;
      if (failOnLlmFailures) issues.push(message);
      else warnings.push(message);
    }
  }

  const databaseSize = databaseRows.find((row) => row.metric === "database_size")?.value ?? "";
  const backupCount = backupRows.length;
  const emailStatus = emailRows.map((row) => `${row.status}:${row.count}`).join(", ") || "none";
  const llmStatus = llmRows.map((row) => `${row.endpoint}/${row.status}:${row.calls}`).join(", ") || "none";

  return {
    date,
    issues,
    warnings,
    databaseSize,
    backupCount,
    emailStatus,
    llmStatus,
    evidenceLevel: parsed.evidenceLevel ?? "unknown"
  };
}

function reportStatusFromMarkdown(date, content) {
  return reportStatusFromRows(date, {
    evidenceLevel: "unknown",
    heartbeats: parseTable(content, "Heartbeats"),
    jobRows: parseTable(content, "Jobs"),
    failureRows: parseTable(content, "Recent Job Failures"),
    emailRows: parseTable(content, "Email"),
    llmRows: parseTable(content, "LLM"),
    queueRows: parseTable(content, "Latest Queue Health"),
    backupRows: parseTable(content, "Backups"),
    databaseRows: parseTable(content, "Database")
  });
}

function reportStatusFromJson(date, content) {
  const data = JSON.parse(content);
  const tables = data.tables ?? {};
  return reportStatusFromRows(date, {
    evidenceLevel: data.evidenceLevel ?? "unknown",
    heartbeats: tables.heartbeats ?? [],
    jobRows: tables.jobs ?? [],
    failureRows: tables.recentJobFailures ?? [],
    emailRows: tables.email ?? [],
    llmRows: tables.llm ?? [],
    queueRows: tables.latestQueueHealth ?? [],
    backupRows: tables.backups ?? [],
    databaseRows: tables.database ?? []
  });
}

function reportStatus(date, report) {
  if (report.json) return reportStatusFromJson(date, readFileSync(report.json, "utf8"));
  return reportStatusFromMarkdown(date, readFileSync(report.md, "utf8"));
}

if (!existsSync(opsDir)) {
  console.error(`ops directory not found: ${opsDir}`);
  process.exit(1);
}

const reports = new Map();
for (const name of readdirSync(opsDir)) {
  const parsed = parseDailyCheckFileName(name);
  if (!parsed) continue;
  const report = reports.get(parsed.date) ?? {};
  report[parsed.format] = join(opsDir, name);
  reports.set(parsed.date, report);
}

const latestDate = explicitEndDate ?? [...reports.keys()].sort().at(-1);
if (!latestDate) {
  console.error(`no daily-check-YYYY-MM-DD.{md,json} files found in ${opsDir}`);
  process.exit(1);
}

const dates = expectedDates(latestDate, requiredDays);
const missing = dates.filter((date) => !reports.has(date));
const statuses = dates
  .filter((date) => reports.has(date))
  .map((date) => reportStatus(date, reports.get(date)));
const evidenceLevels = [...new Set(statuses.map((status) => status.evidenceLevel ?? "unknown"))].sort();
const evidenceLevel = explicitEvidenceLevel
  ?? (statuses.length === requiredDays && statuses.every((status) => status.evidenceLevel === "production") ? "production" : "local");
const issues = [
  ...missing.map((date) => `${date}: missing daily check report`),
  ...statuses.flatMap((status) => status.issues)
];
const warnings = statuses.flatMap((status) => status.warnings);
const outputPath = process.env.OPS_TRIAL_SUMMARY_OUTPUT ?? join(opsDir, `trial-summary-${latestDate}.md`);
const outputJsonPath = process.env.OPS_TRIAL_SUMMARY_JSON_OUTPUT
  ?? (outputPath.toLowerCase().endsWith(".md") ? outputPath.replace(/\.md$/i, ".json") : `${outputPath}.json`);

function table(headers, rows) {
  if (rows.length === 0) return "_No rows._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n") + "\n";
}

const markdown = [
  `# daily-arxiv ${requiredDays}-day Trial Summary ending ${latestDate}`,
  "",
  `Status: ${issues.length === 0 ? "PASS" : "FAIL"}`,
  `Evidence level: ${evidenceLevel}`,
  `Daily evidence levels: ${evidenceLevels.join(", ") || "none"}`,
  `Reports directory: ${opsDir}`,
  `Expected dates: ${dates.join(", ")}`,
  "",
  "## Daily Evidence",
  table(
    ["date", "evidence_level", "database_size", "backup_files", "email", "llm", "issues", "warnings"],
    statuses.map((status) => [
      status.date,
      status.evidenceLevel,
      status.databaseSize,
      String(status.backupCount),
      status.emailStatus,
      status.llmStatus,
      String(status.issues.length),
      String(status.warnings.length)
    ])
  ),
  "## Issues",
  issues.length ? issues.map((issue) => `- ${issue}`).join("\n") + "\n" : "_No issues._\n",
  "## Warnings",
  warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") + "\n" : "_No warnings._\n"
].join("\n");

const payload = {
  generatedAt: new Date().toISOString(),
  status: issues.length === 0 ? "PASS" : "FAIL",
  evidenceLevel,
  dailyEvidenceLevels: evidenceLevels,
  reportsDirectory: opsDir,
  requiredDays,
  latestDate,
  expectedDates: dates,
  missingDates: missing,
  dailyEvidence: statuses,
  issues,
  warnings
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);
mkdirSync(dirname(outputJsonPath), { recursive: true });
writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Trial summary written: ${outputPath}`);
console.log(`Trial summary JSON written: ${outputJsonPath}`);

if (issues.length > 0) {
  process.exit(1);
}
