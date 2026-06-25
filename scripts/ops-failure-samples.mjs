import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const composeFile = process.env.OPS_FAILURE_SAMPLE_COMPOSE_FILE ?? process.env.COMPOSE_FILE ?? "docker-compose.yml";
const postgresService = process.env.OPS_FAILURE_SAMPLE_POSTGRES_SERVICE ?? "postgres";
const postgresUser = process.env.OPS_FAILURE_SAMPLE_POSTGRES_USER ?? "daily_arxiv";
const database = process.env.OPS_FAILURE_SAMPLE_DB ?? "daily_arxiv";
const windowHours = Math.max(1, Math.floor(Number(process.env.OPS_FAILURE_SAMPLE_WINDOW_HOURS ?? 72)));
const generatedAt = new Date();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.OPS_FAILURE_SAMPLE_TIMEZONE ?? "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(generatedAt);
const outputBase = process.env.OPS_FAILURE_SAMPLE_OUTPUT_BASE ?? join("data", "ops", `failure-samples-${day}`);
const pdfUrl = process.env.OPS_FAILURE_SAMPLE_PDF_URL ?? "https://arxiv.org/pdf/9999.99999";
const llmBaseUrl = process.env.OPS_FAILURE_SAMPLE_LLM_BASE_URL;
const llmApiKey = process.env.OPS_FAILURE_SAMPLE_LLM_API_KEY ?? "invalid-key-for-failure-sample";
const llmModel = process.env.OPS_FAILURE_SAMPLE_LLM_MODEL ?? "daily-arxiv-nonexistent-model";
const timeoutMs = Math.max(1000, Math.floor(Number(process.env.OPS_FAILURE_SAMPLE_TIMEOUT_MS ?? 15000)));
const evidenceLevel = process.env.OPS_FAILURE_SAMPLE_EVIDENCE_LEVEL ?? "local";

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
  try {
    const output = psql(sql);
    if (!output) return [];
    return output.split("\n").map((line) => line.split("\t"));
  } catch (error) {
    return [{
      error: error instanceof Error ? error.message : String(error)
    }];
  }
}

function parseRows(headers, outputRows) {
  return outputRows.map((row) => {
    if (!Array.isArray(row)) return row;
    return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
  });
}

function truncate(value, max = 1200) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function sanitizeHeaders(headers) {
  const sanitized = {};
  for (const [key, value] of headers.entries()) {
    if (/authorization|cookie|token|key|secret/i.test(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function endpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1") ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

function urlKind(value) {
  if (!value) return "missing";
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.endsWith(".localhost")) {
      return "loopback";
    }
    if (/^127\./.test(hostname)) return "loopback";
    return "external";
  } catch {
    return "invalid";
  }
}

async function probePdf() {
  const startedAt = new Date();
  try {
    const response = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.text().catch(() => "");
    return {
      kind: "pdf",
      url: pdfUrl,
      startedAt: startedAt.toISOString(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: sanitizeHeaders(response.headers),
      bodySample: truncate(body)
    };
  } catch (error) {
    return {
      kind: "pdf",
      url: pdfUrl,
      startedAt: startedAt.toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function probeLlm() {
  if (!llmBaseUrl) {
    return {
      kind: "llm",
      skipped: true,
      reason: "Set OPS_FAILURE_SAMPLE_LLM_BASE_URL to capture a real OpenAI-compatible provider failure sample."
    };
  }

  const url = endpoint(llmBaseUrl);
  const startedAt = new Date();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${llmApiKey}`
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: llmModel,
        stream: false,
        messages: [
          { role: "user", content: "Return a one word diagnostic response." }
        ]
      })
    });
    const body = await response.text().catch(() => "");
    return {
      kind: "llm",
      url,
      model: llmModel,
      startedAt: startedAt.toISOString(),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: sanitizeHeaders(response.headers),
      bodySample: truncate(body)
    };
  } catch (error) {
    return {
      kind: "llm",
      url,
      model: llmModel,
      startedAt: startedAt.toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function markdownTable(headers, bodyRows) {
  if (bodyRows.length === 0) return "_No rows._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${headers.map((header) => String(row[header] ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")).join(" | ")} |`)
  ].join("\n") + "\n";
}

const jobFailures = parseRows(
  ["type", "status", "message", "createdAt", "metadata"],
  rows(`
select type, status, left(coalesce(message, ''), 240), created_at::text, left(metadata::text, 800)
from job_log
where status in ('failed', 'stalled')
  and created_at >= now() - interval '${windowHours} hours'
order by created_at desc
limit 30;
`)
);
const llmFailures = parseRows(
  ["endpoint", "model", "status", "error", "createdAt", "promptChars", "completionChars", "usedPdfText"],
  rows(`
select endpoint, model, status, left(coalesce(error, ''), 240), created_at::text, prompt_chars::text, completion_chars::text, used_pdf_text::text
from llm_call_log
where status = 'failed'
  and created_at >= now() - interval '${windowHours} hours'
order by created_at desc
limit 30;
`)
);
const emailFailures = parseRows(
  ["provider", "status", "error", "createdAt"],
  rows(`
select provider, status, left(coalesce(error, ''), 240), created_at::text
from email_log
where status like 'failed%'
  and created_at >= now() - interval '${windowHours} hours'
order by created_at desc
limit 30;
`)
);

const probes = [await probePdf(), await probeLlm()];
const evidence = {
  level: evidenceLevel,
  pdfUrlKind: urlKind(pdfUrl),
  llmUrlKind: urlKind(llmBaseUrl)
};
const payload = {
  generatedAt: generatedAt.toISOString(),
  evidenceLevel,
  evidence,
  windowHours,
  database,
  probes,
  jobFailures,
  llmFailures,
  emailFailures
};

const markdown = [
  `# daily-arxiv Failure Samples ${day}`,
  "",
  `Generated at: ${generatedAt.toISOString()}`,
  `Evidence level: ${evidenceLevel}`,
  `PDF URL kind: ${evidence.pdfUrlKind}`,
  `LLM URL kind: ${evidence.llmUrlKind}`,
  `Window: last ${windowHours}h`,
  "",
  "## Active Probes",
  "```json",
  JSON.stringify(probes, null, 2),
  "```",
  "",
  "## Job Failures",
  markdownTable(["type", "status", "message", "createdAt", "metadata"], jobFailures),
  "## LLM Failures",
  markdownTable(["endpoint", "model", "status", "error", "createdAt", "promptChars", "completionChars", "usedPdfText"], llmFailures),
  "## Email Failures",
  markdownTable(["provider", "status", "error", "createdAt"], emailFailures)
].join("\n");

mkdirSync(dirname(outputBase), { recursive: true });
writeFileSync(`${outputBase}.json`, JSON.stringify(payload, null, 2));
writeFileSync(`${outputBase}.md`, markdown);
console.log(`Failure samples written: ${outputBase}.md`);
console.log(`Failure samples JSON written: ${outputBase}.json`);
