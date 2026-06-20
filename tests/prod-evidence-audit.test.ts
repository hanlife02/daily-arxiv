import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function day() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function writeJson(dir: string, name: string, data: unknown) {
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`);
}

function runAudit(dir: string, allowIncomplete = false) {
  const outputBase = join(dir, "audit");
  const result = spawnSync(process.execPath, ["scripts/prod-evidence-audit.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROD_EVIDENCE_DIR: dir,
      PROD_EVIDENCE_OUTPUT_BASE: outputBase,
      PROD_EVIDENCE_ALLOW_INCOMPLETE: allowIncomplete ? "1" : ""
    },
    encoding: "utf8"
  });
  const output = JSON.parse(readFileSync(`${outputBase}.json`, "utf8"));
  return { result, output };
}

function writeProductionEvidenceFixture(dir: string, date: string) {
  writeJson(dir, `auth-email-smoke-${date}.json`, {
    status: "PASS",
    checks: [
      { name: "sign-up API" },
      { name: "verification email captured" },
      { name: "verification URL" },
      { name: "database email_verified" },
      { name: "verified user sign-in" }
    ]
  });
  writeJson(dir, `auth-smtp-delivery-${date}.json`, {
    status: "PASS",
    evidenceLevel: "production",
    smtpHostKind: "external",
    accepted: ["ops@example.com"]
  });
  writeJson(dir, `prod-readiness-${date}.json`, {
    status: "PASS",
    liveProbe: true,
    allowLoopback: false,
    checks: [{ name: "app url", status: "pass" }]
  });
  writeJson(dir, `trial-summary-${date}.json`, {
    status: "PASS",
    evidenceLevel: "production",
    missingDates: [],
    dailyEvidence: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-06-${String(index + 10).padStart(2, "0")}`,
      evidenceLevel: "production"
    }))
  });
  writeJson(dir, `failure-samples-${date}.json`, {
    evidenceLevel: "production",
    probes: [
      { kind: "pdf", ok: false, url: "https://arxiv.org/pdf/not-found" },
      { kind: "llm", ok: false, url: "https://api.provider.example/v1/chat/completions" }
    ]
  });
  writeJson(dir, `llm-billing-reconcile-${date}.json`, {
    evidenceLevel: "production",
    providerTotal: { calls: 3 },
    localTotal: { calls: 3 },
    issues: []
  });
  writeJson(dir, `restore-app-smoke-${date}.json`, {
    status: "PASS",
    evidenceLevel: "production"
  });
}

describe("production evidence audit script", () => {
  it("passes when all production evidence artifacts satisfy the audit contract", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-prod-evidence-pass-"));
    writeProductionEvidenceFixture(dir, day());

    const { result, output } = runAudit(dir);

    expect(result.status).toBe(0);
    expect(output.status).toBe("PASS");
    expect(output.results).toHaveLength(8);
    expect(output.results.every((item: { status: string }) => item.status === "PASS")).toBe(true);
  });

  it("fails and emits next actions when required artifacts are missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-prod-evidence-missing-"));

    const { result, output } = runAudit(dir, true);

    expect(result.status).toBe(0);
    expect(output.status).toBe("FAIL");
    expect(output.results.every((item: { status: string }) => item.status === "MISSING")).toBe(true);
    expect(output.results.find((item: { item: string }) => item.item === "auth SMTP production delivery")?.nextAction)
      .toContain("pnpm prod:auth-smtp");
    expect(output.results.find((item: { item: string }) => item.item === "7-day production trial")?.nextAction)
      .toContain("pnpm ops:trial-summary");
  });

  it("rejects local and loopback evidence for production-only artifacts", () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-prod-evidence-local-"));
    const date = day();
    writeProductionEvidenceFixture(dir, date);
    writeJson(dir, `auth-smtp-delivery-${date}.json`, {
      status: "PASS",
      evidenceLevel: "local",
      smtpHostKind: "loopback",
      accepted: ["ops@example.com"]
    });
    writeJson(dir, `failure-samples-${date}.json`, {
      evidenceLevel: "production",
      probes: [
        { kind: "pdf", ok: false, url: "https://arxiv.org/pdf/not-found" },
        { kind: "llm", ok: false, url: "http://127.0.0.1:9/v1/chat/completions" }
      ]
    });
    writeJson(dir, `restore-app-smoke-${date}.json`, {
      status: "PASS",
      evidenceLevel: "local"
    });

    const { result, output } = runAudit(dir, true);

    expect(result.status).toBe(0);
    expect(output.status).toBe("FAIL");
    expect(output.results.find((item: { item: string }) => item.item === "auth SMTP production delivery")?.detail)
      .toBe("evidenceLevel=local");
    expect(output.results.find((item: { item: string }) => item.item === "supplier and PDF failure samples")?.detail)
      .toBe("LLM probe uses loopback endpoint");
    expect(output.results.find((item: { item: string }) => item.item === "production restore app smoke")?.detail)
      .toBe("evidenceLevel=local");
  });
});
