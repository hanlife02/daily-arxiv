import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function writeJson(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCsv(path: string, rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "")).join(","))
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function billingEnv(extra: Record<string, string>) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPS_LLM_BILLING_")) delete env[key];
  }
  delete env.LLM_COST_RATES_JSON;
  delete env.LLM_COST_CHARS_PER_TOKEN;
  delete env.COMPOSE_FILE;
  return { ...env, ...extra };
}

function runBilling(dir: string, exportPath: string, localLogPath: string, extraEnv: Record<string, string> = {}) {
  const outputBase = join(dir, "billing");
  const result = spawnSync(process.execPath, ["scripts/ops-llm-billing-reconcile.mjs"], {
    cwd: process.cwd(),
    env: billingEnv({
      OPS_LLM_BILLING_EXPORT: exportPath,
      OPS_LLM_BILLING_LOCAL_LOG_JSON: localLogPath,
      OPS_LLM_BILLING_OUTPUT_BASE: outputBase,
      OPS_LLM_BILLING_TIMEZONE: "UTC",
      OPS_LLM_BILLING_RATES_JSON: "{\"gpt-a\":{\"promptUsdPerMillionTokens\":1,\"completionUsdPerMillionTokens\":2},\"gpt-b\":{\"promptUsdPerMillionTokens\":1,\"completionUsdPerMillionTokens\":1}}",
      ...extraEnv
    }),
    encoding: "utf8"
  });
  const payload = JSON.parse(readFileSync(`${outputBase}.json`, "utf8"));
  return { result, payload, markdown: readFileSync(`${outputBase}.md`, "utf8") };
}

describe("ops LLM billing reconciliation script", () => {
  it("reconciles provider CSV rows with measured local token logs", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-llm-billing-pass-"));
    const providerExport = join(dir, "provider.csv");
    const localLog = join(dir, "local.json");
    writeCsv(providerExport, [
      {
        date: "2026-06-20",
        model: "gpt-a",
        calls: 1,
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost_usd: 0.0002
      }
    ]);
    writeJson(localLog, [
      {
        createdAt: "2026-06-20T10:00:00.000Z",
        model: "gpt-a",
        status: "succeeded",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    ]);

    const { result, payload, markdown } = runBilling(dir, providerExport, localLog, {
      OPS_LLM_BILLING_EVIDENCE_LEVEL: "production"
    });

    expect(result.status).toBe(0);
    expect(payload.evidenceLevel).toBe("production");
    expect(payload.localSourceKind).toBe("json");
    expect(payload.providerTotal).toMatchObject({ calls: 1, totalTokens: 150, costUsd: 0.0002 });
    expect(payload.localTotal).toMatchObject({ calls: 1, measuredTokenCalls: 1, totalTokens: 150, costUsd: 0.0002 });
    expect(payload.deltas).toEqual({ tokens: 0, costUsd: 0 });
    expect(payload.issues).toEqual([]);
    expect(markdown).toContain("Evidence level: production");
  });

  it("reports provider-only usage as token and cost deltas", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-llm-billing-delta-"));
    const providerExport = join(dir, "provider.csv");
    const localLog = join(dir, "local.json");
    writeCsv(providerExport, [
      {
        date: "2026-06-20",
        model: "gpt-a",
        calls: 1,
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cost_usd: 0.0002
      },
      {
        date: "2026-06-20",
        model: "gpt-b",
        calls: 1,
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
        cost_usd: 0.0003
      }
    ]);
    writeJson(localLog, [
      {
        createdAt: "2026-06-20T10:00:00.000Z",
        model: "gpt-a",
        status: "succeeded",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    ]);

    const { result, payload } = runBilling(dir, providerExport, localLog);

    expect(result.status).toBe(0);
    expect(payload.evidenceLevel).toBe("local");
    expect(payload.providerTotal.totalTokens).toBe(450);
    expect(payload.localTotal.totalTokens).toBe(150);
    expect(payload.deltas.tokens).toBe(300);
    expect(payload.byModel.find((row: { key: string }) => row.key === "gpt-b"))
      .toMatchObject({ local: { calls: 0 }, deltaTokens: 300, deltaCostUsd: 0.0003 });
    expect(payload.issues).toContain("Token delta is 66.7% of provider total.");
  });

  it("supports JSON provider exports and flags unpriced estimated local usage", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-llm-billing-json-"));
    const providerExport = join(dir, "provider.json");
    const localLog = join(dir, "local.json");
    writeJson(providerExport, {
      data: [
        {
          usage_date: "2026-06-20",
          model_name: "custom-model",
          requests: 1,
          input_tokens: 20,
          output_tokens: 10,
          total_tokens: 30,
          amount_usd: 0.0001
        }
      ]
    });
    writeJson(localLog, {
      rows: [
        {
          created_at: "2026-06-20T10:00:00.000Z",
          model_name: "custom-model",
          status: "failed",
          prompt_chars: 80,
          completion_chars: 40
        }
      ]
    });

    const { result, payload, markdown } = runBilling(dir, providerExport, localLog, {
      OPS_LLM_BILLING_CHARS_PER_TOKEN: "4",
      OPS_LLM_BILLING_RATES_JSON: "{}"
    });

    expect(result.status).toBe(0);
    expect(payload.providerTotal).toMatchObject({ calls: 1, totalTokens: 30, costUsd: 0.0001 });
    expect(payload.localTotal).toMatchObject({
      calls: 1,
      failed: 1,
      measuredTokenCalls: 0,
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      costUsd: 0
    });
    expect(payload.issues).toContain("Provider cost is non-zero but local estimated cost is zero; configure LLM_COST_RATES_JSON or OPS_LLM_BILLING_RATES_JSON.");
    expect(payload.issues).toContain("Unpriced local models: custom-model.");
    expect(markdown).toContain("Priced models: none");
  });
});
