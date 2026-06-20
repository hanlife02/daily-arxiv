import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const composeFile = process.env.OPS_DAILY_CHECK_COMPOSE_FILE ?? process.env.COMPOSE_FILE ?? "docker-compose.yml";
const postgresService = process.env.OPS_DAILY_CHECK_POSTGRES_SERVICE ?? "postgres";
const postgresUser = process.env.OPS_DAILY_CHECK_POSTGRES_USER ?? "daily_arxiv";
const database = process.env.OPS_DAILY_CHECK_DB ?? "daily_arxiv";
const windowHours = Math.max(1, Math.floor(Number(process.env.OPS_DAILY_CHECK_WINDOW_HOURS ?? 24)));
const backupDir = process.env.OPS_DAILY_CHECK_BACKUP_DIR ?? "data/backups";
const appDataDir = process.env.OPS_DAILY_CHECK_APP_DATA_DIR ?? "data/app";
const timeZone = process.env.OPS_DAILY_CHECK_TIMEZONE ?? "Asia/Shanghai";
const evidenceLevel = process.env.OPS_DAILY_CHECK_EVIDENCE_LEVEL ?? "local";
const generatedAt = new Date();
const day = formatDateInTimeZone(generatedAt, timeZone);
const outputPath = process.env.OPS_DAILY_CHECK_OUTPUT ?? join("data", "ops", `daily-check-${day}.md`);
const outputJsonPath = process.env.OPS_DAILY_CHECK_JSON_OUTPUT
  ?? (outputPath.toLowerCase().endsWith(".md") ? outputPath.replace(/\.md$/i, ".json") : `${outputPath}.json`);

function formatDateInTimeZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateTimeInTimeZone(date, zone) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      postgresService,
      "psql",
      "-U",
      postgresUser,
      "-d",
      database,
      "-t",
      "-A",
      "-F",
      "\t",
      "-c",
      sql
    ],
    { encoding: "utf8" }
  ).trim();
}

function rows(sql) {
  const output = psql(sql);
  if (!output) return [];
  return output.split("\n").map((line) => line.split("\t"));
}

function mdEscape(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function table(headers, bodyRows) {
  if (bodyRows.length === 0) return "_No rows._\n";
  return [
    `| ${headers.map(mdEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`)
  ].join("\n") + "\n";
}

function objects(headers, bodyRows) {
  return bodyRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function backupRows() {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => name.startsWith("daily-arxiv-"))
    .map((name) => {
      const path = join(backupDir, name);
      const stat = statSync(path);
      return {
        name,
        sizeBytes: stat.size,
        mtime: stat.mtime
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, 10)
    .map((file) => [
      file.name,
      `${(file.sizeBytes / 1024 / 1024).toFixed(2)} MiB`,
      file.mtime.toISOString()
    ]);
}

function heartbeatRows() {
  return ["worker-heartbeat.json", "scheduler-heartbeat.json"].map((name) => {
    const path = join(appDataDir, name);
    if (!existsSync(path)) return [name, "missing", ""];
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      return [
        name,
        parsed.status ?? "present",
        parsed.updatedAt ?? parsed.lastSuccessAt ?? ""
      ];
    } catch (error) {
      return [name, "unreadable", error instanceof Error ? error.message : String(error)];
    }
  });
}

const interval = `${windowHours} hours`;
const dbSummary = rows(`
select 'database', current_database()
union all select 'database_size', pg_size_pretty(pg_database_size(current_database()))
union all select 'users', count(*)::text from "user"
union all select 'papers', count(*)::text from paper
union all select 'reports', count(*)::text from report
union all select 'job_logs', count(*)::text from job_log
union all select 'email_logs', count(*)::text from email_log
union all select 'llm_call_logs', count(*)::text from llm_call_log;
`);

const jobSummary = rows(`
select type, status, count(*)::text
from job_log
where created_at >= now() - interval '${interval}'
group by type, status
order by type, status;
`);

const recentFailures = rows(`
select type, status, left(coalesce(message, ''), 180), created_at::text
from job_log
where status in ('failed', 'stalled')
  and created_at >= now() - interval '${interval}'
order by created_at desc
limit 20;
`);

const emailSummary = rows(`
select status, count(*)::text
from email_log
where created_at >= now() - interval '${interval}'
group by status
order by status;
`);

const llmSummary = rows(`
select
  endpoint,
  status,
  count(*)::text,
  coalesce(sum(prompt_chars), 0)::text,
  coalesce(sum(completion_chars), 0)::text,
  count(*) filter (where used_pdf_text)::text
from llm_call_log
where created_at >= now() - interval '${interval}'
group by endpoint, status
order by endpoint, status;
`);

const latestQueueHealth = rows(`
select
  coalesce(metadata->>'observedAt', created_at::text),
  coalesce(metadata->>'totalBacklog', ''),
  coalesce(metadata->>'totalActive', ''),
  coalesce(metadata->>'totalFailed', ''),
  coalesce(metadata->>'totalDelayed', '')
from job_log
where type = 'queue-health'
order by created_at desc
limit 1;
`);

const queueHealthByQueue = rows(`
with latest as (
  select metadata
  from job_log
  where type = 'queue-health'
  order by created_at desc
  limit 1
)
select
  queue->>'name',
  queue->>'waiting',
  queue->>'active',
  queue->>'delayed',
  queue->>'failed',
  queue->>'backlog'
from latest, jsonb_array_elements(metadata->'queues') queue
order by queue->>'name';
`);

const retentionSummary = rows(`
select status, count(*)::text
from job_log
where type = 'data-retention'
  and created_at >= now() - interval '${interval}'
group by status
order by status;
`);

const backups = backupRows();
const heartbeats = heartbeatRows();
const generatedAtLocal = formatDateTimeInTimeZone(generatedAt, timeZone);
const tables = {
  database: objects(["metric", "value"], dbSummary),
  heartbeats: objects(["file", "status", "updated"], heartbeats),
  jobs: objects(["type", "status", "count"], jobSummary),
  recentJobFailures: objects(["type", "status", "message", "created_at"], recentFailures),
  email: objects(["status", "count"], emailSummary),
  llm: objects(["endpoint", "status", "calls", "prompt_chars", "completion_chars", "used_pdf_text_calls"], llmSummary),
  latestQueueHealth: objects(["observed_at", "total_backlog", "total_active", "total_failed", "total_delayed"], latestQueueHealth),
  queueHealthByQueue: objects(["queue", "waiting", "active", "delayed", "failed", "backlog"], queueHealthByQueue),
  dataRetention: objects(["status", "count"], retentionSummary),
  backups: objects(["file", "size", "modified_at"], backups)
};
const payload = {
  generatedAt: generatedAt.toISOString(),
  generatedAtLocal,
  evidenceLevel,
  day,
  timeZone,
  windowHours,
  composeFile,
  postgresService,
  database,
  backupDir,
  appDataDir,
  tables
};
const markdown = [
  `# daily-arxiv Daily Ops Check ${day}`,
  "",
  `Generated at: ${generatedAtLocal} ${timeZone} (${generatedAt.toISOString()})`,
  `Evidence level: ${evidenceLevel}`,
  `Window: last ${windowHours}h`,
  `Database: ${database}`,
  "",
  "## Database",
  table(["metric", "value"], dbSummary),
  "## Heartbeats",
  table(["file", "status", "updated"], heartbeats),
  "## Jobs",
  table(["type", "status", "count"], jobSummary),
  "## Recent Job Failures",
  table(["type", "status", "message", "created_at"], recentFailures),
  "## Email",
  table(["status", "count"], emailSummary),
  "## LLM",
  table(["endpoint", "status", "calls", "prompt_chars", "completion_chars", "used_pdf_text_calls"], llmSummary),
  "## Latest Queue Health",
  table(["observed_at", "total_backlog", "total_active", "total_failed", "total_delayed"], latestQueueHealth),
  table(["queue", "waiting", "active", "delayed", "failed", "backlog"], queueHealthByQueue),
  "## Data Retention",
  table(["status", "count"], retentionSummary),
  "## Backups",
  table(["file", "size", "modified_at"], backups)
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);
mkdirSync(dirname(outputJsonPath), { recursive: true });
writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Daily ops check written: ${outputPath}`);
console.log(`Daily ops check JSON written: ${outputJsonPath}`);
