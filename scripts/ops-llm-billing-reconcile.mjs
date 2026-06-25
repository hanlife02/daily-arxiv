import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const exportPath = process.env.OPS_LLM_BILLING_EXPORT;
const localLogJsonPath = process.env.OPS_LLM_BILLING_LOCAL_LOG_JSON;
const composeFile = process.env.OPS_LLM_BILLING_COMPOSE_FILE ?? process.env.COMPOSE_FILE ?? "docker-compose.yml";
const postgresService = process.env.OPS_LLM_BILLING_POSTGRES_SERVICE ?? "postgres";
const postgresUser = process.env.OPS_LLM_BILLING_POSTGRES_USER ?? "daily_arxiv";
const database = process.env.OPS_LLM_BILLING_DB ?? "daily_arxiv";
const timeZone = process.env.OPS_LLM_BILLING_TIMEZONE ?? "UTC";
const generatedAt = new Date();
const generatedDay = formatDateInTimeZone(generatedAt, "Asia/Shanghai");
const outputBase = process.env.OPS_LLM_BILLING_OUTPUT_BASE ?? join("data", "ops", `llm-billing-reconcile-${generatedDay}`);
const evidenceLevel = process.env.OPS_LLM_BILLING_EVIDENCE_LEVEL ?? "local";
const localSourceKind = localLogJsonPath ? "json" : "database";
const charsPerToken = positiveNumber(
  process.env.OPS_LLM_BILLING_CHARS_PER_TOKEN ?? process.env.LLM_COST_CHARS_PER_TOKEN,
  4
);
const costRates = parseCostRates(process.env.OPS_LLM_BILLING_RATES_JSON ?? process.env.LLM_COST_RATES_JSON);

if (!exportPath) {
  console.error("set OPS_LLM_BILLING_EXPORT to a provider CSV/JSON usage export");
  process.exit(1);
}

if (!existsSync(exportPath)) {
  console.error(`provider usage export not found: ${exportPath}`);
  process.exit(1);
}

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

function parseCostRates(raw) {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([model, rate]) => {
          const prompt = Number(rate.promptUsdPerMillionTokens ?? rate.inputUsdPerMillionTokens);
          const completion = Number(rate.completionUsdPerMillionTokens ?? rate.outputUsdPerMillionTokens);
          if (!model || !Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) {
            return undefined;
          }
          return [model, { promptUsdPerMillionTokens: prompt, completionUsdPerMillionTokens: completion }];
        })
        .filter(Boolean)
    );
  } catch {
    return {};
  }
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function flattenRecord(record, prefix = "", output = {}) {
  for (const [key, value] of Object.entries(record ?? {})) {
    const joined = prefix ? `${prefix}_${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      flattenRecord(value, joined, output);
      if (!(key in output)) output[key] = value;
    } else {
      output[joined] = value;
      if (!(key in output)) output[key] = value;
    }
  }
  return output;
}

function pick(record, names) {
  const flat = flattenRecord(record);
  const values = new Map(Object.entries(flat).map(([key, value]) => [normalizedKey(key), value]));
  for (const name of names) {
    const value = values.get(normalizedKey(name));
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function numeric(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[$,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumeric(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDateValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const text = String(value).trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  const date = new Date(dateOnly ? `${dateOnly[1]}T00:00:00.000Z` : text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...body] = rows.filter((items) => items.some((item) => item.trim() !== ""));
  return body.map((items) => Object.fromEntries(headers.map((header, index) => [header.trim(), items[index] ?? ""])));
}

function firstObjectArray(value) {
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    return value;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const key of ["data", "rows", "records", "items", "usage", "results"]) {
    const child = value[key];
    if (Array.isArray(child)) return child;
  }
  for (const child of Object.values(value)) {
    const found = firstObjectArray(child);
    if (found) return found;
  }
  return undefined;
}

function providerRowsFromExport(path) {
  const content = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(content);
    return firstObjectArray(parsed) ?? [];
  }
  return csvRows(content);
}

function providerUsageRows(rows) {
  return rows
    .map((row) => {
      const date = parseDateValue(pick(row, [
        "date",
        "day",
        "usage_date",
        "created_at",
        "created",
        "timestamp",
        "start_time",
        "end_time"
      ]));
      if (!date) return undefined;
      const promptTokens = numeric(pick(row, ["prompt_tokens", "input_tokens", "input", "tokens_input"]));
      const completionTokens = numeric(pick(row, [
        "completion_tokens",
        "output_tokens",
        "output",
        "tokens_output"
      ]));
      const totalTokens = numeric(pick(row, ["total_tokens", "tokens", "token_count"])) || promptTokens + completionTokens;
      const costUsd = numeric(pick(row, ["cost_usd", "usd", "amount_usd", "cost", "amount", "total_cost"]));
      return {
        day: formatDateInTimeZone(date, timeZone),
        model: String(pick(row, ["model", "model_name", "model_id", "sku"]) ?? "unmodeled"),
        calls: numeric(pick(row, ["calls", "requests", "request_count", "count"])) || 1,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd
      };
    })
    .filter(Boolean);
}

function validateDateText(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`${name} must use YYYY-MM-DD: ${value}`);
    process.exit(1);
  }
  return value;
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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

function localRowsFromDb(startDate, endDate) {
  const output = psql(`
select
  created_at::text,
  model,
  status,
  prompt_chars::text,
  completion_chars::text,
  prompt_tokens::text,
  completion_tokens::text,
  total_tokens::text
from llm_call_log
where created_at >= '${startDate}T00:00:00.000Z'::timestamptz
  and created_at < '${addDays(endDate, 1)}T00:00:00.000Z'::timestamptz
order by created_at;
`);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [createdAt, model, status, promptChars, completionChars, promptTokens, completionTokens, totalTokens] = line.split("\t");
    return {
      createdAt,
      model,
      status,
      promptChars: numeric(promptChars),
      completionChars: numeric(completionChars),
      promptTokens: optionalNumeric(promptTokens),
      completionTokens: optionalNumeric(completionTokens),
      totalTokens: optionalNumeric(totalTokens)
    };
  });
}

function localRowsFromJson(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rows = firstObjectArray(parsed) ?? [];
  return rows.map((row) => ({
    createdAt: pick(row, ["created_at", "createdAt", "timestamp", "date", "day"]),
    model: String(pick(row, ["model", "model_name"]) ?? "unmodeled"),
    status: String(pick(row, ["status"]) ?? "succeeded"),
    promptChars: numeric(pick(row, ["prompt_chars", "promptChars"])),
    completionChars: numeric(pick(row, ["completion_chars", "completionChars"])),
    promptTokens: optionalNumeric(pick(row, ["prompt_tokens", "promptTokens", "input_tokens", "inputTokens"])),
    completionTokens: optionalNumeric(pick(row, ["completion_tokens", "completionTokens", "output_tokens", "outputTokens"])),
    totalTokens: optionalNumeric(pick(row, ["total_tokens", "totalTokens", "tokens"]))
  }));
}

function emptyTotals() {
  return {
    calls: 0,
    failed: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    promptChars: 0,
    completionChars: 0,
    measuredTokenCalls: 0,
    costUsd: 0
  };
}

function roundedUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function addProviderUsage(map, key, row) {
  const item = map.get(key) ?? emptyTotals();
  item.calls += row.calls;
  item.promptTokens += row.promptTokens;
  item.completionTokens += row.completionTokens;
  item.totalTokens += row.totalTokens;
  item.costUsd = roundedUsd(item.costUsd + row.costUsd);
  map.set(key, item);
}

function estimateLocalCost(model, promptTokens, completionTokens) {
  const rate = costRates[model];
  if (!rate) return 0;
  return promptTokens * rate.promptUsdPerMillionTokens / 1_000_000
    + completionTokens * rate.completionUsdPerMillionTokens / 1_000_000;
}

function addLocalUsage(map, key, row) {
  const item = map.get(key) ?? emptyTotals();
  const promptChars = numeric(row.promptChars);
  const completionChars = numeric(row.completionChars);
  const observedPromptTokens = optionalNumeric(row.promptTokens);
  const observedCompletionTokens = optionalNumeric(row.completionTokens);
  const observedTotalTokens = optionalNumeric(row.totalTokens);
  const promptTokens = observedPromptTokens ?? Math.ceil(promptChars / charsPerToken);
  const completionTokens = observedCompletionTokens ?? Math.ceil(completionChars / charsPerToken);
  item.calls += 1;
  if (row.status === "failed") item.failed += 1;
  item.promptChars += promptChars;
  item.completionChars += completionChars;
  item.promptTokens += promptTokens;
  item.completionTokens += completionTokens;
  item.totalTokens += observedTotalTokens ?? promptTokens + completionTokens;
  if (observedPromptTokens !== undefined || observedCompletionTokens !== undefined || observedTotalTokens !== undefined) {
    item.measuredTokenCalls += 1;
  }
  item.costUsd = roundedUsd(item.costUsd + estimateLocalCost(row.model, promptTokens, completionTokens));
  map.set(key, item);
}

function filterLocalRows(rows, startDate, endDate) {
  return rows.filter((row) => {
    const date = parseDateValue(row.createdAt);
    if (!date) return false;
    const day = formatDateInTimeZone(date, timeZone);
    return day >= startDate && day <= endDate;
  });
}

function buildMaps(providerRows, localRows) {
  const providerByDay = new Map();
  const providerByModel = new Map();
  const localByDay = new Map();
  const localByModel = new Map();

  for (const row of providerRows) {
    addProviderUsage(providerByDay, row.day, row);
    addProviderUsage(providerByModel, row.model, row);
  }

  for (const row of localRows) {
    const date = parseDateValue(row.createdAt);
    if (!date) continue;
    addLocalUsage(localByDay, formatDateInTimeZone(date, timeZone), row);
    addLocalUsage(localByModel, row.model, row);
  }

  return { providerByDay, providerByModel, localByDay, localByModel };
}

function totalFromMap(map) {
  return [...map.values()].reduce((total, row) => {
    total.calls += row.calls;
    total.failed += row.failed;
    total.promptTokens += row.promptTokens;
    total.completionTokens += row.completionTokens;
    total.totalTokens += row.totalTokens;
    total.promptChars += row.promptChars;
    total.completionChars += row.completionChars;
    total.measuredTokenCalls += row.measuredTokenCalls;
    total.costUsd = roundedUsd(total.costUsd + row.costUsd);
    return total;
  }, emptyTotals());
}

function reconcileRows(providerMap, localMap) {
  return [...new Set([...providerMap.keys(), ...localMap.keys()])]
    .sort()
    .map((key) => {
      const provider = providerMap.get(key) ?? emptyTotals();
      const local = localMap.get(key) ?? emptyTotals();
      return {
        key,
        provider,
        local,
        deltaTokens: provider.totalTokens - local.totalTokens,
        deltaCostUsd: roundedUsd(provider.costUsd - local.costUsd)
      };
    });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value) {
  return `$${Number(value).toFixed(6)}`;
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

const rawProviderRows = providerUsageRows(providerRowsFromExport(exportPath));
if (rawProviderRows.length === 0) {
  console.error(`no provider usage rows found in ${exportPath}`);
  process.exit(1);
}

const inferredStart = rawProviderRows.map((row) => row.day).sort()[0];
const inferredEnd = rawProviderRows.map((row) => row.day).sort().at(-1);
const startDate = validateDateText(process.env.OPS_LLM_BILLING_START_DATE ?? inferredStart, "OPS_LLM_BILLING_START_DATE");
const endDate = validateDateText(process.env.OPS_LLM_BILLING_END_DATE ?? inferredEnd, "OPS_LLM_BILLING_END_DATE");
const providerRows = rawProviderRows.filter((row) => row.day >= startDate && row.day <= endDate);
const localRows = filterLocalRows(
  localLogJsonPath ? localRowsFromJson(localLogJsonPath) : localRowsFromDb(startDate, endDate),
  startDate,
  endDate
);
const maps = buildMaps(providerRows, localRows);
const providerTotal = totalFromMap(maps.providerByDay);
const localTotal = totalFromMap(maps.localByDay);
const dayRows = reconcileRows(maps.providerByDay, maps.localByDay);
const modelRows = reconcileRows(maps.providerByModel, maps.localByModel);
const unpricedLocalModels = [...maps.localByModel.keys()].filter((model) => !costRates[model]).sort();
const issues = [];

if (providerRows.length === 0) issues.push("No provider rows in selected date range.");
if (localRows.length === 0) issues.push("No local llm_call_log rows in selected date range.");
if (providerTotal.totalTokens > 0) {
  const deltaRatio = Math.abs(providerTotal.totalTokens - localTotal.totalTokens) / providerTotal.totalTokens;
  if (deltaRatio > 0.2) issues.push(`Token delta is ${(deltaRatio * 100).toFixed(1)}% of provider total.`);
}
if (providerTotal.costUsd > 0 && localTotal.costUsd === 0) {
  issues.push("Provider cost is non-zero but local estimated cost is zero; configure LLM_COST_RATES_JSON or OPS_LLM_BILLING_RATES_JSON.");
}
if (unpricedLocalModels.length > 0) {
  issues.push(`Unpriced local models: ${unpricedLocalModels.join(", ")}.`);
}

const jsonOutput = {
  generatedAt: generatedAt.toISOString(),
  evidenceLevel,
  exportPath,
  localSourceKind,
  localSource: localLogJsonPath ?? `docker compose ${composeFile}/${postgresService}/${database}`,
  dateRange: { startDate, endDate, timeZone },
  charsPerToken,
  pricedModels: Object.keys(costRates).sort(),
  providerTotal,
  localTotal,
  deltas: {
    tokens: providerTotal.totalTokens - localTotal.totalTokens,
    costUsd: roundedUsd(providerTotal.costUsd - localTotal.costUsd)
  },
  byDay: dayRows,
  byModel: modelRows,
  issues
};

const markdown = [
  `# daily-arxiv LLM Billing Reconciliation ${startDate} to ${endDate}`,
  "",
  `Generated at: ${generatedAt.toISOString()}`,
  `Evidence level: ${evidenceLevel}`,
  `Provider export: ${exportPath}`,
  `Local source kind: ${localSourceKind}`,
  `Local source: ${localLogJsonPath ?? `docker compose ${composeFile}/${postgresService}/${database}`}`,
  `Time zone: ${timeZone}`,
  `Chars/token estimate: ${charsPerToken}`,
  `Priced models: ${Object.keys(costRates).sort().join(", ") || "none"}`,
  "",
  "## Summary",
  table(
    ["source", "calls", "failed", "measured_local_calls", "prompt_tokens", "completion_tokens", "total_tokens", "cost_usd"],
    [
      ["provider", providerTotal.calls, "", "", providerTotal.promptTokens, providerTotal.completionTokens, providerTotal.totalTokens, formatUsd(providerTotal.costUsd)],
      ["local_observed_or_estimate", localTotal.calls, localTotal.failed, localTotal.measuredTokenCalls, localTotal.promptTokens, localTotal.completionTokens, localTotal.totalTokens, formatUsd(localTotal.costUsd)],
      ["delta_provider_minus_local", "", "", "", "", "", providerTotal.totalTokens - localTotal.totalTokens, formatUsd(providerTotal.costUsd - localTotal.costUsd)]
    ].map((row) => row.map((value) => typeof value === "number" ? formatNumber(value) : value))
  ),
  "## By Model",
  table(
    ["model", "provider_calls", "local_calls", "provider_tokens", "local_tokens", "token_delta", "provider_cost", "local_cost", "cost_delta"],
    modelRows.map((row) => [
      row.key,
      formatNumber(row.provider.calls),
      formatNumber(row.local.calls),
      formatNumber(row.provider.totalTokens),
      formatNumber(row.local.totalTokens),
      formatNumber(row.deltaTokens),
      formatUsd(row.provider.costUsd),
      formatUsd(row.local.costUsd),
      formatUsd(row.deltaCostUsd)
    ])
  ),
  "## By Day",
  table(
    ["day", "provider_calls", "local_calls", "provider_tokens", "local_tokens", "token_delta", "provider_cost", "local_cost", "cost_delta"],
    dayRows.map((row) => [
      row.key,
      formatNumber(row.provider.calls),
      formatNumber(row.local.calls),
      formatNumber(row.provider.totalTokens),
      formatNumber(row.local.totalTokens),
      formatNumber(row.deltaTokens),
      formatUsd(row.provider.costUsd),
      formatUsd(row.local.costUsd),
      formatUsd(row.deltaCostUsd)
    ])
  ),
  "## Issues",
  issues.length > 0 ? issues.map((issue) => `- ${issue}`).join("\n") + "\n" : "_No issues._\n"
].join("\n");

mkdirSync(dirname(outputBase), { recursive: true });
writeFileSync(`${outputBase}.json`, `${JSON.stringify(jsonOutput, null, 2)}\n`);
writeFileSync(`${outputBase}.md`, markdown);
console.log(`LLM billing reconciliation written: ${outputBase}.md`);
console.log(`LLM billing reconciliation JSON written: ${outputBase}.json`);
