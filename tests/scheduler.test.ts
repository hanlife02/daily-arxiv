import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueDueReports, runSchedulerTick } from "@/worker/scheduler";

const schedulerMocks = vi.hoisted(() => ({
  preferenceRows: [] as Array<{ preference: {
    userId: string;
    categories: string[];
    sendTime: string;
    timezone: string;
  } }>,
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  findReport: vi.fn(),
  enqueueReportJob: vi.fn(),
  enqueueCrawlJob: vi.fn(),
  enqueueBackupJob: vi.fn(),
  enqueueRetentionJob: vi.fn(),
  logJob: vi.fn(),
  getAdminSettings: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: schedulerMocks.select,
    query: {
      report: {
        findFirst: schedulerMocks.findReport
      }
    }
  }
}));

vi.mock("@/lib/app/jobs", () => ({
  enqueueReportJob: schedulerMocks.enqueueReportJob,
  enqueueCrawlJob: schedulerMocks.enqueueCrawlJob,
  enqueueBackupJob: schedulerMocks.enqueueBackupJob,
  enqueueRetentionJob: schedulerMocks.enqueueRetentionJob,
  logJob: schedulerMocks.logJob
}));

vi.mock("@/lib/app/settings", () => ({
  getAdminSettings: schedulerMocks.getAdminSettings
}));

describe("scheduler queueing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedulerMocks.preferenceRows = [];
    const selectChain = {
      from: schedulerMocks.from,
      innerJoin: schedulerMocks.innerJoin,
      where: schedulerMocks.where
    };
    schedulerMocks.select.mockReturnValue(selectChain);
    schedulerMocks.from.mockReturnValue(selectChain);
    schedulerMocks.innerJoin.mockReturnValue(selectChain);
    schedulerMocks.where.mockImplementation(async () => schedulerMocks.preferenceRows);
    schedulerMocks.findReport.mockResolvedValue(null);
    schedulerMocks.enqueueReportJob.mockResolvedValue({ type: "report-generation", jobId: "report-job-1" });
    schedulerMocks.enqueueCrawlJob.mockResolvedValue({ type: "arxiv-crawl", jobId: "crawl-job-1" });
    schedulerMocks.enqueueBackupJob.mockResolvedValue({ type: "backup", jobId: "backup-job-1" });
    schedulerMocks.enqueueRetentionJob.mockResolvedValue({ type: "data-retention", jobId: "retention-job-1" });
    schedulerMocks.logJob.mockResolvedValue(undefined);
    schedulerMocks.getAdminSettings.mockResolvedValue({ arxivMaxResultsPerCategory: 100 });
  });

  it("skips users that already have a report for the scheduler batch date", async () => {
    schedulerMocks.preferenceRows = [
      {
        preference: {
          userId: "existing-user",
          categories: ["cs.AI"],
          sendTime: "13:00",
          timezone: "UTC"
        }
      },
      {
        preference: {
          userId: "new-user",
          categories: ["cs.LG"],
          sendTime: "13:00",
          timezone: "UTC"
        }
      },
      {
        preference: {
          userId: "empty-user",
          categories: [],
          sendTime: "13:00",
          timezone: "UTC"
        }
      },
      {
        preference: {
          userId: "future-user",
          categories: ["cs.CL"],
          sendTime: "13:31",
          timezone: "UTC"
        }
      }
    ];
    schedulerMocks.findReport
      .mockResolvedValueOnce({ id: "existing-report" })
      .mockResolvedValueOnce(null);

    const queued = await enqueueDueReports(new Date("2026-06-20T13:30:00.000Z"));

    expect(queued).toBe(1);
    expect(schedulerMocks.findReport).toHaveBeenCalledTimes(2);
    expect(schedulerMocks.enqueueReportJob).toHaveBeenCalledTimes(1);
    expect(schedulerMocks.enqueueReportJob).toHaveBeenCalledWith({
      userId: "new-user",
      batchDate: "2026-06-20",
      requestedBy: "scheduler"
    });
    expect(schedulerMocks.logJob).toHaveBeenCalledWith({
      type: "report-generation",
      status: "queued",
      message: "Scheduler queued 1 due report jobs",
      metadata: { batchDate: "2026-06-20", queued: 1 }
    });
  });

  it("does not enqueue daily crawl, backup, or retention jobs twice in the same scheduler state window", async () => {
    const state = {};
    const now = new Date("2026-06-20T13:30:00.000Z");

    const first = await runSchedulerTick(now, state);
    const second = await runSchedulerTick(new Date("2026-06-20T13:35:00.000Z"), state);

    expect(first).toEqual({
      crawlQueued: true,
      reportsQueued: 0,
      backupQueued: true,
      retentionQueued: true
    });
    expect(second).toEqual({
      crawlQueued: false,
      reportsQueued: 0,
      backupQueued: false,
      retentionQueued: false
    });
    expect(schedulerMocks.enqueueCrawlJob).toHaveBeenCalledTimes(1);
    expect(schedulerMocks.enqueueCrawlJob).toHaveBeenCalledWith({
      maxResultsPerCategory: 100,
      requestedBy: "scheduler"
    });
    expect(schedulerMocks.enqueueBackupJob).toHaveBeenCalledTimes(1);
    expect(schedulerMocks.enqueueRetentionJob).toHaveBeenCalledTimes(1);
  });
});
