import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function trialDates(endDate: string, days = 7) {
  return Array.from({ length: days }, (_, index) => addDays(endDate, index - days + 1));
}

function dailyCheckJson(evidenceLevel = "production") {
  return {
    evidenceLevel,
    tables: {
      heartbeats: [
        { file: "worker-heartbeat.json", status: "fresh" },
        { file: "scheduler-heartbeat.json", status: "fresh" }
      ],
      jobs: [
        { type: "report-generation", status: "succeeded", count: "1" }
      ],
      recentJobFailures: [],
      email: [
        { status: "sent", count: "1" }
      ],
      llm: [
        { endpoint: "read-summary", status: "succeeded", calls: "1" }
      ],
      latestQueueHealth: [
        {
          total_backlog: "0",
          total_active: "0",
          total_failed: "0",
          total_delayed: "0"
        }
      ],
      backups: [
        { file: "backup.sql", size_bytes: "1024" }
      ],
      database: [
        { metric: "database_size", value: "10 MB" }
      ]
    }
  };
}

function writeDailyCheck(dir: string, date: string, data = dailyCheckJson()) {
  writeFileSync(join(dir, `daily-check-${date}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

function runTrialSummary(dir: string, endDate: string) {
  const output = join(dir, "summary.md");
  const jsonOutput = join(dir, "summary.json");
  const result = spawnSync(process.execPath, ["scripts/ops-trial-summary.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPS_TRIAL_DIR: dir,
      OPS_TRIAL_END_DATE: endDate,
      OPS_TRIAL_SUMMARY_OUTPUT: output,
      OPS_TRIAL_SUMMARY_JSON_OUTPUT: jsonOutput
    },
    encoding: "utf8"
  });
  const payload = JSON.parse(readFileSync(jsonOutput, "utf8"));
  return { result, payload, markdown: readFileSync(output, "utf8") };
}

describe("ops trial summary script", () => {
  it("passes with seven production daily-check JSON reports", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-trial-summary-pass-"));
    const endDate = "2026-06-20";
    for (const date of trialDates(endDate)) {
      writeDailyCheck(dir, date);
    }

    const { result, payload } = runTrialSummary(dir, endDate);

    expect(result.status).toBe(0);
    expect(payload.status).toBe("PASS");
    expect(payload.evidenceLevel).toBe("production");
    expect(payload.dailyEvidence).toHaveLength(7);
    expect(payload.missingDates).toEqual([]);
    expect(payload.issues).toEqual([]);
  });

  it("fails when an expected daily-check report is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-trial-summary-missing-"));
    const endDate = "2026-06-20";
    for (const date of trialDates(endDate).filter((date) => date !== "2026-06-17")) {
      writeDailyCheck(dir, date);
    }

    const { result, payload } = runTrialSummary(dir, endDate);

    expect(result.status).toBe(1);
    expect(payload.status).toBe("FAIL");
    expect(payload.missingDates).toEqual(["2026-06-17"]);
    expect(payload.issues).toContain("2026-06-17: missing daily check report");
  });

  it("keeps the summary evidence level local when any daily report is local", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-trial-summary-local-"));
    const endDate = "2026-06-20";
    for (const date of trialDates(endDate)) {
      writeDailyCheck(dir, date, dailyCheckJson(date === "2026-06-19" ? "local" : "production"));
    }

    const { result, payload, markdown } = runTrialSummary(dir, endDate);

    expect(result.status).toBe(0);
    expect(payload.status).toBe("PASS");
    expect(payload.evidenceLevel).toBe("local");
    expect(payload.dailyEvidenceLevels).toEqual(["local", "production"]);
    expect(markdown).toContain("Evidence level: local");
  });
});
