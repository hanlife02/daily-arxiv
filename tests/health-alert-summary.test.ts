import { describe, expect, it } from "vitest";
import { buildHealthAlertDigest, buildHealthAlertWebhookPayload } from "@/lib/app/health-alert-summary";

describe("health alert digest", () => {
  it("returns null when health has no alert-worthy items", () => {
    expect(
      buildHealthAlertDigest({
        checks: {
          postgres: { ok: true, message: "connected" },
          redis: { ok: true, message: "connected" }
        },
        queues: [
          {
            name: "backup",
            ok: true
          }
        ],
        jobFailures: []
      })
    ).toBeNull();
  });

  it("builds a stable digest for checks, job failures, and queue issues", () => {
    const now = new Date("2026-06-19T10:00:00.000Z");
    const health = {
      checks: {
        postgres: { ok: true, message: "connected" },
        backup: { ok: false, message: "no backups found" }
      },
      queues: [
        {
          name: "report-generation",
          ok: true,
          longRunningActiveJob: {
            name: "generate",
            activeMs: 8_000_000
          },
          oldestFailedJob: {
            name: "generate",
            failedReason: "model timeout"
          },
          duplicateJobs: [
            {
              name: "generate",
              count: 2
            }
          ]
        }
      ],
      jobFailures: [
        {
          type: "backup",
          terminalCount: 4,
          failedCount: 2,
          consecutiveFailures: 2,
          alert: true,
          lastFailureCategory: "backup",
          lastMessage: "pg_dump failed"
        }
      ]
    };

    const first = buildHealthAlertDigest(health, now);
    const second = buildHealthAlertDigest(health, now);

    expect(first?.fingerprint).toBe(second?.fingerprint);
    expect(first?.subject).toBe("[daily-arxiv] 健康告警 5 项");
    expect(first?.text).toContain("check:backup: no backups found");
    expect(first?.text).toContain("job:backup: failed 2/4");
    expect(first?.text).toContain("category backup");
    expect(first?.text).toContain("queue:report-generation: long-running generate");
    expect(first?.text).toContain("queue:report-generation: oldest failed generate");
    expect(first?.text).toContain("queue:report-generation: duplicate generate x2");
  });

  it("builds a webhook payload from the digest", () => {
    const now = new Date("2026-06-19T10:00:00.000Z");
    const digest = {
      fingerprint: "abc123",
      subject: "[daily-arxiv] 健康告警 1 项",
      text: "daily-arxiv 健康告警",
      items: ["check:backup: no backups found"]
    };

    expect(buildHealthAlertWebhookPayload(digest, now)).toEqual({
      service: "daily-arxiv",
      type: "health-alert",
      createdAt: "2026-06-19T10:00:00.000Z",
      fingerprint: "abc123",
      subject: "[daily-arxiv] 健康告警 1 项",
      text: "daily-arxiv 健康告警",
      items: ["check:backup: no backups found"]
    });
  });
});
