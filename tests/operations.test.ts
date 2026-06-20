import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isDueSendTime, localHourMinute } from "@/lib/jobs/schedule";
import { explainScore, rankPapers } from "@/lib/reports/scoring";
import { generateDailyReport } from "@/lib/reports/generate";
import { classifyJobFailureReason, summarizeJobFailures } from "@/lib/app/job-health";
import { summarizeIncidentHistoryLog } from "@/lib/app/incident-history";
import { summarizeOperationalIncidents } from "@/lib/app/incident-summary";
import { buildJobLogPagination, jobLogPageHref, parseJobLogBrowserFilters } from "@/lib/app/job-log-browser";
import { buildLogTimeline, extractLogCorrelationKeys, hasLogCorrelationKeys, summarizeLogRootCause } from "@/lib/app/log-correlation";
import { summarizeLlmUsage } from "@/lib/app/llm-usage-summary";
import {
  summarizeDuplicateQueueJobs,
  summarizeLongRunningActiveJob,
  summarizeOldestFailedJob,
  summarizeQueueBacklogJobs
} from "@/lib/app/queue-health";
import { buildQueueHealthLog, summarizeQueueHealthTrend } from "@/lib/app/queue-health-log";
import { readSchedulerHeartbeat, readWorkerHeartbeat, writeSchedulerHeartbeat, writeWorkerHeartbeat } from "@/lib/app/worker-health";
import { paper } from "./helpers";

describe("operational scheduling", () => {
  it("marks reports due once the user send time has passed in the configured timezone", () => {
    const now = new Date("2026-06-18T01:30:00.000Z");
    expect(localHourMinute(now, "Asia/Shanghai")).toBe("09:30");
    expect(isDueSendTime("09:30", "Asia/Shanghai", now)).toBe(true);
    expect(isDueSendTime("09:25", "Asia/Shanghai", now)).toBe(true);
    expect(isDueSendTime("09:31", "Asia/Shanghai", now)).toBe(false);
  });
});

describe("worker heartbeat", () => {
  it("reports missing, fresh, and stale heartbeat states", () => {
    const previousPath = process.env.WORKER_HEARTBEAT_PATH;
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-heartbeat-"));
    process.env.WORKER_HEARTBEAT_PATH = join(dir, "worker-heartbeat.json");

    try {
      expect(readWorkerHeartbeat(new Date("2026-06-18T12:00:00.000Z"), 120_000).ok).toBe(false);

      writeWorkerHeartbeat(
        new Date("2026-06-18T11:00:00.000Z"),
        new Date("2026-06-18T12:00:00.000Z")
      );

      const fresh = readWorkerHeartbeat(new Date("2026-06-18T12:00:30.000Z"), 120_000);
      expect(fresh.ok).toBe(true);
      expect(fresh.heartbeat?.service).toBe("daily-arxiv-worker");

      const stale = readWorkerHeartbeat(new Date("2026-06-18T12:03:00.000Z"), 120_000);
      expect(stale.ok).toBe(false);
      expect(stale.message).toContain("stale");
    } finally {
      if (previousPath === undefined) delete process.env.WORKER_HEARTBEAT_PATH;
      else process.env.WORKER_HEARTBEAT_PATH = previousPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scheduler heartbeat", () => {
  it("reports success, failure, stale, and disabled states", () => {
    const previousPath = process.env.SCHEDULER_HEARTBEAT_PATH;
    const previousDisabled = process.env.WORKER_SCHEDULER_DISABLED;
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-scheduler-"));
    process.env.SCHEDULER_HEARTBEAT_PATH = join(dir, "scheduler-heartbeat.json");
    delete process.env.WORKER_SCHEDULER_DISABLED;

    try {
      expect(readSchedulerHeartbeat(new Date("2026-06-18T12:00:00.000Z"), 120_000).ok).toBe(false);

      writeSchedulerHeartbeat({
        service: "daily-arxiv-scheduler",
        pid: 1,
        status: "succeeded",
        updatedAt: "2026-06-18T12:00:00.000Z",
        lastStartedAt: "2026-06-18T11:59:59.000Z",
        lastSuccessAt: "2026-06-18T12:00:00.000Z",
        consecutiveFailures: 0,
        summary: {
          crawlQueued: true,
          reportsQueued: 2,
          backupQueued: false,
          retentionQueued: false
        }
      });
      expect(readSchedulerHeartbeat(new Date("2026-06-18T12:00:30.000Z"), 120_000).ok).toBe(true);
      expect(readSchedulerHeartbeat(new Date("2026-06-18T12:03:00.000Z"), 120_000).message).toContain("stale");

      writeSchedulerHeartbeat({
        service: "daily-arxiv-scheduler",
        pid: 1,
        status: "failed",
        updatedAt: "2026-06-18T12:04:00.000Z",
        lastFailureAt: "2026-06-18T12:04:00.000Z",
        consecutiveFailures: 2,
        error: "redis unavailable"
      });
      const failed = readSchedulerHeartbeat(new Date("2026-06-18T12:04:10.000Z"), 120_000);
      expect(failed.ok).toBe(false);
      expect(failed.message).toContain("redis unavailable");

      process.env.WORKER_SCHEDULER_DISABLED = "true";
      const disabled = readSchedulerHeartbeat(new Date("2026-06-18T12:04:10.000Z"), 120_000);
      expect(disabled.ok).toBe(true);
      expect(disabled.message).toContain("disabled");
    } finally {
      if (previousPath === undefined) delete process.env.SCHEDULER_HEARTBEAT_PATH;
      else process.env.SCHEDULER_HEARTBEAT_PATH = previousPath;
      if (previousDisabled === undefined) delete process.env.WORKER_SCHEDULER_DISABLED;
      else process.env.WORKER_SCHEDULER_DISABLED = previousDisabled;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("job failure aggregation", () => {
  it("alerts on consecutive failures, failure rate thresholds, and reason categories", () => {
    const rows = [
      { type: "backup", status: "failed", message: "pg_dump failed", metadata: { command: "pg_dump" }, createdAt: new Date("2026-06-18T12:00:00.000Z") },
      { type: "backup", status: "failed", message: "pg_dump failed again", createdAt: new Date("2026-06-18T11:00:00.000Z") },
      { type: "backup", status: "succeeded", message: "ok", createdAt: new Date("2026-06-18T10:00:00.000Z") },
      { type: "email-notification", status: "failed", message: "smtp failed", createdAt: new Date("2026-06-18T12:00:00.000Z") },
      { type: "email-notification", status: "succeeded", message: "ok", createdAt: new Date("2026-06-18T11:00:00.000Z") },
      { type: "email-notification", status: "succeeded", message: "ok", createdAt: new Date("2026-06-18T10:00:00.000Z") },
      { type: "email-notification", status: "succeeded", message: "ok", createdAt: new Date("2026-06-18T09:00:00.000Z") },
      { type: "report-generation", status: "failed", message: "model timeout", createdAt: new Date("2026-06-18T12:00:00.000Z") },
      { type: "report-generation", status: "queued", message: "queued", createdAt: new Date("2026-06-18T12:01:00.000Z") }
    ];

    const summary = summarizeJobFailures(rows);
    const backup = summary.find((item) => item.type === "backup");
    const email = summary.find((item) => item.type === "email-notification");
    const report = summary.find((item) => item.type === "report-generation");

    expect(backup?.consecutiveFailures).toBe(2);
    expect(backup?.alert).toBe(true);
    expect(backup?.lastFailureCategory).toBe("backup");
    expect(backup?.failureCategories).toContainEqual(expect.objectContaining({
      category: "backup",
      count: 2
    }));
    expect(email?.failureRate).toBe(0.25);
    expect(email?.alert).toBe(true);
    expect(email?.failureCategories[0]?.category).toBe("smtp");
    expect(report?.terminalCount).toBe(1);
    expect(report?.alert).toBe(false);
    expect(report?.lastFailureCategory).toBe("llm");
  });

  it("classifies common job failure reasons from message and metadata", () => {
    expect(classifyJobFailureReason({ type: "report-generation", message: "OpenAI model timeout" })).toBe("llm");
    expect(classifyJobFailureReason({ type: "arxiv-crawl", message: "fetch failed ECONNREFUSED" })).toBe("network");
    expect(classifyJobFailureReason({ type: "data-retention", message: "PostgreSQL relation missing" })).toBe("database");
    expect(classifyJobFailureReason({ type: "report-generation", message: "rate limit 429" })).toBe("quota");
    expect(classifyJobFailureReason({ type: "report-generation", message: "summary failed", metadata: { source: "PDF parse failed" } })).toBe("pdf");
  });
});

describe("operational incident summary", () => {
  it("combines health, job, queue, and LLM diagnostics into prioritized incidents", () => {
    const incidents = summarizeOperationalIncidents({
      healthChecks: {
        postgres: { ok: false, message: "connection refused" },
        backup: { ok: true, message: "ok" }
      },
      jobFailures: [
        {
          type: "report-generation",
          alert: true,
          failedCount: 2,
          failureRate: 1,
          consecutiveFailures: 2,
          lastFailureCategory: "llm",
          lastMessage: "model timeout",
          lastAt: new Date("2026-06-18T12:00:00.000Z")
        },
        {
          type: "backup",
          alert: false,
          failedCount: 1,
          failureRate: 0.2,
          consecutiveFailures: 1
        }
      ],
      queueTrend: {
        points: [],
        latest: {
          createdAt: new Date("2026-06-18T12:05:00.000Z"),
          observedAt: "2026-06-18T12:05:00.000Z",
          totalWaiting: 4,
          totalActive: 1,
          totalDelayed: 2,
          totalFailed: 1,
          totalWaitingChildren: 0,
          totalBacklog: 6
        },
        backlogDelta: 3,
        maxBacklog: 6
      },
      llmFailureDiagnostics: [
        {
          category: "quota",
          label: "限流/额度",
          count: 3,
          lastAt: new Date("2026-06-18T12:04:00.000Z"),
          lastEndpoint: "read-chat",
          lastModel: "gpt-a",
          lastError: "LLM request failed: 429 rate limited",
          actionHint: "检查供应商 rate limit。"
        }
      ]
    });

    expect(incidents.map((item) => item.key)).toEqual([
      "job:report-generation",
      "health:postgres",
      "queue:backlog",
      "llm:quota"
    ]);
    expect(incidents[0]).toMatchObject({
      severity: "critical",
      title: "report-generation 任务失败告警",
      actionHint: expect.stringContaining("LLM")
    });
    expect(incidents.find((item) => item.key === "llm:quota")?.evidence).toContain("429");
  });
});

describe("incident history snapshots", () => {
  it("turns persisted health alert logs into review drafts", () => {
    const snapshot = summarizeIncidentHistoryLog({
      id: "log-1",
      status: "succeeded",
      message: "Sent health alert via email(1)",
      createdAt: new Date("2026-06-18T12:00:00.000Z"),
      metadata: {
        fingerprint: "abc123",
        items: [
          "check:backup: no backups found",
          "job:backup: failed 2/4, consecutive 2"
        ],
        email: { sent: true, sentCount: 1 },
        webhook: { sent: false, reason: "webhook_not_configured" }
      }
    });

    expect(snapshot.fingerprint).toBe("abc123");
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.deliverySummary).toBe("email sent(1) · webhook webhook_not_configured");
    expect(snapshot.reviewDraft).toContain("# daily-arxiv 事件复盘草稿");
    expect(snapshot.reviewDraft).toContain("check:backup: no backups found");
    expect(snapshot.reviewDraft).toContain("目标环境日志片段");
  });
});

describe("job log browser filters", () => {
  it("normalizes filters, pagination, and page links", () => {
    expect(parseJobLogBrowserFilters({
      jobStatus: "failed",
      jobType: " report-generation ",
      jobPage: "3"
    })).toMatchObject({
      status: "failed",
      type: "report-generation",
      page: 3,
      offset: 24,
      pageSize: 12
    });

    expect(parseJobLogBrowserFilters({
      jobStatus: "all",
      jobType: "",
      jobPage: "-1"
    })).toMatchObject({
      status: undefined,
      type: undefined,
      page: 1,
      offset: 0
    });

    expect(buildJobLogPagination(25, 9)).toMatchObject({
      page: 3,
      pageCount: 3,
      hasPrevious: true,
      hasNext: false,
      previousPage: 2,
      nextPage: 3
    });

    expect(jobLogPageHref({ status: "failed", type: "backup" }, 2)).toBe("/admin?jobStatus=failed&jobType=backup&jobPage=2");
    expect(jobLogPageHref({ status: undefined, type: undefined }, 1)).toBe("/admin");
  });
});

describe("log correlation keys", () => {
  it("extracts related user, report, and paper identifiers from nested metadata", () => {
    const keys = extractLogCorrelationKeys({
      jobId: "report-generation--u1",
      data: {
        userId: "u1",
        batchDate: "2026-06-19"
      },
      result: {
        reportId: "r1",
        papers: [
          { paperId: "2501.00001", userId: "u1" },
          { paperId: "2501.00002", userId: "u2" },
          { paperId: "" }
        ]
      }
    });

    expect(keys).toEqual({
      userIds: ["u1", "u2"],
      reportIds: ["r1"],
      paperIds: ["2501.00001", "2501.00002"]
    });
    expect(hasLogCorrelationKeys(keys)).toBe(true);
    expect(hasLogCorrelationKeys({ userIds: [], reportIds: [], paperIds: [] })).toBe(false);
  });

  it("builds a chronological event timeline from job, LLM, and email logs", () => {
    const timeline = buildLogTimeline({
      job: {
        type: "report-generation",
        status: "failed",
        message: "model timeout",
        createdAt: new Date("2026-06-19T10:01:00.000Z")
      },
      llmCalls: [
        {
          endpoint: "report-summary",
          model: "gpt-a",
          status: "failed",
          error: "timeout",
          createdAt: new Date("2026-06-19T10:00:30.000Z")
        }
      ],
      emails: [
        {
          recipient: "user@example.com",
          subject: "Daily arXiv",
          status: "skipped_no_new_papers",
          createdAt: new Date("2026-06-19T10:02:00.000Z")
        }
      ]
    });

    expect(timeline.map((event) => `${event.source}:${event.status}`)).toEqual([
      "llm:failed",
      "job:failed",
      "email:skipped_no_new_papers"
    ]);
    expect(timeline[0]).toMatchObject({
      label: "report-summary/gpt-a",
      message: "timeout"
    });
  });

  it("summarizes a likely root cause from the first failed correlated event", () => {
    const timeline = buildLogTimeline({
      job: {
        type: "report-generation",
        status: "failed",
        message: "report failed",
        createdAt: new Date("2026-06-19T10:01:00.000Z")
      },
      llmCalls: [
        {
          endpoint: "report-summary",
          model: "gpt-a",
          status: "failed",
          error: "model timeout",
          createdAt: new Date("2026-06-19T10:00:30.000Z")
        }
      ],
      emails: []
    });

    const rootCause = summarizeLogRootCause({
      job: {
        type: "report-generation",
        status: "failed",
        message: "report failed",
        createdAt: new Date("2026-06-19T10:01:00.000Z")
      },
      timeline,
      category: "unknown"
    });

    expect(rootCause).toMatchObject({
      category: "llm",
      confidence: "high",
      source: "llm"
    });
    expect(rootCause?.evidence).toContain("model timeout");
    expect(rootCause?.actionHint).toContain("LLM");
  });

  it("points stalled jobs at queue and worker diagnostics", () => {
    const timeline = buildLogTimeline({
      job: {
        type: "report-generation",
        status: "stalled",
        message: "BullMQ job stalled",
        createdAt: new Date("2026-06-19T10:01:00.000Z")
      },
      llmCalls: [],
      emails: []
    });

    const rootCause = summarizeLogRootCause({
      job: {
        type: "report-generation",
        status: "stalled",
        message: "BullMQ job stalled",
        createdAt: new Date("2026-06-19T10:01:00.000Z")
      },
      timeline
    });

    expect(rootCause).toMatchObject({
      category: "queue",
      confidence: "high",
      source: "job"
    });
    expect(rootCause?.actionHint).toContain("worker heartbeat");
  });
});

describe("queue backlog summary", () => {
  it("selects the oldest pending job by effective waiting time", () => {
    const now = new Date("2026-06-18T12:00:00.000Z").getTime();
    const oldest = summarizeQueueBacklogJobs([
      {
        id: "new-waiting",
        name: "crawl",
        state: "waiting",
        timestamp: new Date("2026-06-18T11:59:00.000Z").getTime()
      },
      {
        id: "old-waiting",
        name: "generate",
        state: "waiting",
        timestamp: new Date("2026-06-18T11:30:00.000Z").getTime()
      },
      {
        id: "future-delayed",
        name: "send",
        state: "delayed",
        timestamp: new Date("2026-06-18T11:00:00.000Z").getTime(),
        delay: 90 * 60 * 1000
      },
      {
        id: "done",
        name: "ignore",
        state: "succeeded",
        timestamp: new Date("2026-06-18T10:00:00.000Z").getTime()
      }
    ], now);

    expect(oldest?.id).toBe("old-waiting");
    expect(oldest?.waitingMs).toBe(30 * 60 * 1000);
    expect(oldest?.state).toBe("waiting");
  });

  it("surfaces failed, long-running, and duplicate queue jobs", () => {
    const now = new Date("2026-06-18T12:00:00.000Z").getTime();
    const jobs = [
      {
        id: "failed-new",
        name: "backup",
        state: "failed",
        timestamp: new Date("2026-06-18T10:00:00.000Z").getTime(),
        finishedOn: new Date("2026-06-18T11:50:00.000Z").getTime(),
        failedReason: "pg_dump failed",
        attemptsMade: 1
      },
      {
        id: "failed-old",
        name: "backup",
        state: "failed",
        timestamp: new Date("2026-06-18T09:00:00.000Z").getTime(),
        finishedOn: new Date("2026-06-18T09:05:00.000Z").getTime(),
        failedReason: "connection refused",
        attemptsMade: 2
      },
      {
        id: "active-old",
        name: "generate",
        state: "active",
        timestamp: new Date("2026-06-18T08:00:00.000Z").getTime(),
        processedOn: new Date("2026-06-18T09:30:00.000Z").getTime(),
        attemptsMade: 1
      },
      {
        id: "report-1",
        name: "generate",
        state: "waiting",
        timestamp: new Date("2026-06-18T11:40:00.000Z").getTime(),
        data: { userId: "u1", batchDate: "2026-06-18" }
      },
      {
        id: "report-2",
        name: "generate",
        state: "delayed",
        timestamp: new Date("2026-06-18T11:41:00.000Z").getTime(),
        data: { batchDate: "2026-06-18", userId: "u1" }
      },
      {
        id: "report-3",
        name: "generate",
        state: "waiting",
        timestamp: new Date("2026-06-18T11:42:00.000Z").getTime(),
        data: { userId: "u2", batchDate: "2026-06-18" }
      }
    ];

    expect(summarizeOldestFailedJob(jobs, now)?.id).toBe("failed-old");
    expect(summarizeLongRunningActiveJob(jobs, now, 2 * 60 * 60 * 1000)?.id).toBe("active-old");

    const duplicates = summarizeDuplicateQueueJobs(jobs);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      name: "generate",
      count: 2,
      ids: ["report-1", "report-2"]
    });
  });
});

describe("queue health trend", () => {
  it("builds queue health snapshots and summarizes backlog changes", () => {
    const first = buildQueueHealthLog([
      {
        name: "report-generation",
        ok: true,
        counts: {
          waiting: 2,
          active: 1,
          delayed: 1,
          failed: 0
        }
      }
    ], new Date("2026-06-19T10:00:00.000Z"));
    const second = buildQueueHealthLog([
      {
        name: "report-generation",
        ok: true,
        counts: {
          waiting: 4,
          active: 0,
          delayed: 2,
          failed: 1,
          "waiting-children": 1
        }
      }
    ], new Date("2026-06-19T10:30:00.000Z"));

    expect(first).toMatchObject({
      type: "queue-health",
      status: "succeeded",
      metadata: {
        totalBacklog: 3,
        totalActive: 1,
        totalFailed: 0
      }
    });

    const trend = summarizeQueueHealthTrend([
      { metadata: second.metadata, createdAt: new Date("2026-06-19T10:30:00.000Z") },
      { metadata: first.metadata, createdAt: new Date("2026-06-19T10:00:00.000Z") }
    ]);

    expect(trend.points.map((point) => point.observedAt)).toEqual([
      "2026-06-19T10:00:00.000Z",
      "2026-06-19T10:30:00.000Z"
    ]);
    expect(trend.latest?.totalBacklog).toBe(7);
    expect(trend.latest?.totalFailed).toBe(1);
    expect(trend.backlogDelta).toBe(4);
    expect(trend.maxBacklog).toBe(7);
  });
});

describe("LLM usage summary", () => {
  it("summarizes LLM usage by window, endpoint, model, and user", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const rows = [
      {
        userId: "u1",
        endpoint: "read-summary",
        model: "gpt-a",
        status: "succeeded",
        promptChars: 1000,
        completionChars: 200,
        usedPdfText: true,
        startedAt: new Date("2026-06-18T09:59:58.000Z"),
        finishedAt: new Date("2026-06-18T10:00:00.000Z"),
        createdAt: new Date("2026-06-18T10:00:00.000Z")
      },
      {
        userId: "u1",
        endpoint: "read-chat",
        model: "gpt-a",
        status: "failed",
        error: "LLM request failed: 429 rate limited",
        promptChars: 500,
        completionChars: 0,
        usedPdfText: false,
        startedAt: new Date("2026-06-17T09:59:59.000Z"),
        finishedAt: new Date("2026-06-17T10:00:02.000Z"),
        createdAt: new Date("2026-06-17T10:00:00.000Z")
      },
      {
        userId: "u2",
        endpoint: "report-summary",
        model: "gpt-b",
        status: "succeeded",
        promptChars: 700,
        completionChars: 150,
        usedPdfText: false,
        createdAt: new Date("2026-06-01T10:00:00.000Z")
      },
      {
        userId: "u2",
        endpoint: "read-summary",
        model: "gpt-b",
        status: "failed",
        error: "LLM request failed: 401 unauthorized",
        promptChars: 300,
        completionChars: 0,
        usedPdfText: false,
        createdAt: new Date("2026-06-16T10:00:00.000Z")
      },
      {
        userId: "u2",
        endpoint: "read-chat",
        model: "gpt-b",
        status: "failed",
        error: "fetch failed ECONNREFUSED",
        promptChars: 300,
        completionChars: 0,
        usedPdfText: false,
        createdAt: new Date("2026-06-15T10:00:00.000Z")
      },
      {
        userId: "u3",
        endpoint: "report-summary",
        model: "gpt-a",
        status: "succeeded",
        promptChars: 800,
        completionChars: 400,
        usedPdfText: false,
        createdAt: new Date("2026-04-20T10:00:00.000Z")
      }
    ];

    const summary = summarizeLlmUsage(rows, {
      now,
      windows: [7, 30, 90],
      trendDays: 90,
      userLabels: { u1: "a@example.com", u2: "b@example.com", u3: "c@example.com" },
      costSettings: {
        charsPerToken: 4,
        rates: {
          "gpt-a": {
            promptUsdPerMillionTokens: 1,
            completionUsdPerMillionTokens: 2
          },
          "gpt-b": {
            promptUsdPerMillionTokens: 2,
            completionUsdPerMillionTokens: 4
          }
        }
      }
    });
    const sevenDays = summary.windows.find((item) => item.days === 7);
    const thirtyDays = summary.windows.find((item) => item.days === 30);
    const ninetyDays = summary.windows.find((item) => item.days === 90);

    expect(sevenDays?.calls).toBe(4);
    expect(sevenDays?.failed).toBe(3);
    expect(sevenDays?.failureRate).toBe(0.75);
    expect(sevenDays?.pdfCalls).toBe(1);
    expect(sevenDays?.estimatedPromptTokens).toBe(525);
    expect(sevenDays?.estimatedCompletionTokens).toBe(50);
    expect(sevenDays?.estimatedCostUsd).toBeCloseTo(0.000775, 6);
    expect(sevenDays?.byEndpoint.map((item) => item.key).sort()).toEqual(["read-chat", "read-summary"]);
    expect(sevenDays?.byUser[0]?.label).toBe("a@example.com");
    expect(thirtyDays?.calls).toBe(5);
    expect(thirtyDays?.byModel[0]?.key).toBe("gpt-b");
    expect(thirtyDays?.totalChars).toBe(3150);
    expect(thirtyDays?.estimatedCostUsd).toBeCloseTo(0.001277, 6);
    expect(ninetyDays?.calls).toBe(6);
    expect(ninetyDays?.estimatedCostUsd).toBeCloseTo(0.001677, 6);
    expect(summary.costEstimate).toMatchObject({
      configured: true,
      charsPerToken: 4,
      pricedModels: ["gpt-a", "gpt-b"],
      unpricedModels: []
    });
    expect(summary.trend).toHaveLength(90);
    expect(summary.trend.at(-1)).toMatchObject({
      day: "2026-06-18",
      calls: 1,
      estimatedCostUsd: 0.00035,
      averageDurationMs: 2000
    });
    expect(summary.trend.at(-2)).toMatchObject({
      day: "2026-06-17",
      failed: 1,
      failureRate: 1,
      averageDurationMs: 3000
    });
    expect(summary.insights.highFailureModels[0]).toMatchObject({
      key: "gpt-b",
      failed: 2,
      failureRate: 2 / 3
    });
    expect(summary.insights.failureDiagnostics.map((item) => item.category)).toEqual(["quota", "auth", "network"]);
    expect(summary.insights.failureDiagnostics[0]).toMatchObject({
      label: "限流/额度",
      actionHint: expect.stringContaining("rate limit")
    });
    expect(summary.insights.highLatencyEndpoints[0]).toMatchObject({
      key: "read-chat",
      averageDurationMs: 3000
    });
    expect(summary.insights.highUsageUsers[0]).toMatchObject({
      label: "a@example.com",
      totalChars: 1700
    });
  });

  it("uses observed provider tokens before falling back to character estimates", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const summary = summarizeLlmUsage([
      {
        userId: "u1",
        endpoint: "read-summary",
        model: "gpt-a",
        status: "succeeded",
        promptChars: 4000,
        completionChars: 400,
        promptTokens: 100,
        completionTokens: 10,
        totalTokens: 110,
        usedPdfText: false,
        createdAt: new Date("2026-06-18T10:00:00.000Z")
      },
      {
        userId: "u1",
        endpoint: "read-chat",
        model: "gpt-a",
        status: "succeeded",
        promptChars: 40,
        completionChars: 20,
        usedPdfText: false,
        createdAt: new Date("2026-06-18T11:00:00.000Z")
      }
    ], {
      now,
      windows: [7],
      costSettings: {
        charsPerToken: 4,
        rates: {
          "gpt-a": {
            promptUsdPerMillionTokens: 1,
            completionUsdPerMillionTokens: 2
          }
        }
      }
    });

    expect(summary.windows[0]).toMatchObject({
      estimatedPromptTokens: 110,
      estimatedCompletionTokens: 15,
      measuredTokenCalls: 1,
      measuredPromptTokens: 100,
      measuredCompletionTokens: 10,
      measuredTotalTokens: 110
    });
    expect(summary.windows[0]?.estimatedCostUsd).toBeCloseTo(0.00014, 6);
  });
});

describe("recommendation explainability", () => {
  it("explains why a high value fresh paper is recommended", () => {
    const [ranked] = rankPapers(
      [
        paper({
          title: "Open-Source Benchmark for Language Agents",
          abstract: "We release a large-scale dataset and reproducible evaluation code.",
          publishedAt: new Date("2026-06-18T08:00:00.000Z")
        })
      ],
      {
        categories: ["cs.CL"],
        includeKeywords: ["agent"],
        excludeKeywords: [],
        topN: 1
      },
      new Date("2026-06-18T12:00:00.000Z")
    );

    expect(explainScore(ranked)).toContain("新近发布");
    expect(explainScore(ranked)).toContain("包含数据集/benchmark/代码等价值信号");
  });
});

describe("partial report generation", () => {
  it("keeps the report deliverable when one paper summary fails", async () => {
    const result = await generateDailyReport({
      batchDate: "2026-06-18",
      papers: [
        paper({ arxivId: "2501.00001", title: "Agent Benchmark" }),
        paper({ arxivId: "2501.00002", title: "Agent Dataset" })
      ],
      preference: {
        categories: ["cs.CL"],
        includeKeywords: ["agent"],
        excludeKeywords: [],
        topN: 2
      },
      llmConfig: {
        baseUrl: "https://llm.example",
        apiKey: "key",
        model: "test-model"
      },
      summarize: async (item) => {
        if (item.arxivId === "2501.00002") throw new Error("model timeout");
        return {
          title_original: item.title,
          title_zh: "论文标题",
          abstract_original: item.abstract,
          abstract_zh: "中文摘要",
          one_sentence_summary_zh: "一句话总结",
          summary_zh: "精简总结"
        };
      }
    });

    expect(result.status).toBe("partial_succeeded");
    expect(result.reason).toBe("summarized_with_failures");
    expect(result.markdown).toContain("## 摘要失败");
    expect(result.markdown).toContain("2501.00002：model timeout");
  });
});
