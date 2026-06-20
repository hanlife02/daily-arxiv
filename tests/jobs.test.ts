import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueCrawlJob, enqueueEmailJob, enqueueReportJob, runLoggedJob } from "@/lib/app/jobs";

const jobMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  crawlAdd: vi.fn(),
  reportAdd: vi.fn(),
  emailAdd: vi.fn(),
  backupAdd: vi.fn(),
  retentionAdd: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: jobMocks.insert
  }
}));

vi.mock("@/lib/jobs/queues", () => ({
  getCrawlQueue: () => ({ add: jobMocks.crawlAdd }),
  getReportQueue: () => ({ add: jobMocks.reportAdd }),
  getEmailQueue: () => ({ add: jobMocks.emailAdd }),
  getBackupQueue: () => ({ add: jobMocks.backupAdd }),
  getRetentionQueue: () => ({ add: jobMocks.retentionAdd })
}));

function queuedJob(name: string, data: unknown, options: { jobId?: string }) {
  return {
    id: options.jobId ?? `${name}-job`,
    name,
    data,
    attemptsMade: 0
  };
}

describe("queue job helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobMocks.insert.mockReturnValue({ values: jobMocks.values });
    jobMocks.values.mockResolvedValue(undefined);
    jobMocks.crawlAdd.mockImplementation(async (name, data, options) => queuedJob(name, data, options));
    jobMocks.reportAdd.mockImplementation(async (name, data, options) => queuedJob(name, data, options));
    jobMocks.emailAdd.mockImplementation(async (name, data, options) => queuedJob(name, data, options));
    jobMocks.backupAdd.mockImplementation(async (name, data, options) => queuedJob(name, data, options));
    jobMocks.retentionAdd.mockImplementation(async (name, data, options) => queuedJob(name, data, options));
  });

  it("enqueues scheduler report jobs with deterministic ids and queue logs", async () => {
    const result = await enqueueReportJob({
      userId: "user-1",
      batchDate: "2026-06-20",
      requestedBy: "scheduler"
    });

    expect(jobMocks.reportAdd).toHaveBeenCalledWith("generate", {
      userId: "user-1",
      batchDate: "2026-06-20",
      requestedBy: "scheduler"
    }, {
      jobId: "report-generation--user-1-2026-06-20",
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100
    });
    expect(result).toEqual({
      type: "report-generation",
      jobId: "report-generation--user-1-2026-06-20"
    });
    expect(jobMocks.values).toHaveBeenCalledWith(expect.objectContaining({
      type: "report-generation",
      status: "queued",
      message: "Queued report-generation",
      metadata: expect.objectContaining({
        jobId: "report-generation--user-1-2026-06-20",
        name: "generate",
        attemptsMade: 0,
        data: {
          userId: "user-1",
          batchDate: "2026-06-20",
          requestedBy: "scheduler"
        }
      })
    }));
  });

  it("keeps crawl retry policy on queued crawl jobs", async () => {
    await enqueueCrawlJob({ maxResultsPerCategory: 50, requestedBy: "admin" });

    expect(jobMocks.crawlAdd).toHaveBeenCalledWith("crawl", {
      maxResultsPerCategory: 50,
      requestedBy: "admin"
    }, expect.objectContaining({
      attempts: 2,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 100
    }));
  });

  it("deduplicates email jobs by report id", async () => {
    await enqueueEmailJob({ reportId: "report-1", requestedBy: "report-generation" });

    expect(jobMocks.emailAdd).toHaveBeenCalledWith("send", {
      reportId: "report-1",
      requestedBy: "report-generation"
    }, {
      jobId: "email-notification--report-1",
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100
    });
  });

  it("writes started and succeeded logs around worker jobs", async () => {
    const job = {
      id: "job-1",
      name: "send",
      data: { reportId: "report-1" },
      attemptsMade: 0
    };

    const result = await runLoggedJob(
      "email-notification",
      job as never,
      async () => ({ sent: true }),
      () => "Sent report email"
    );

    expect(result).toEqual({ sent: true });
    expect(jobMocks.values).toHaveBeenCalledTimes(2);
    expect(jobMocks.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: "email-notification",
      status: "started",
      message: "Started email-notification",
      metadata: expect.objectContaining({ jobId: "job-1", name: "send" })
    }));
    expect(jobMocks.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "email-notification",
      status: "succeeded",
      message: "Sent report email",
      metadata: expect.objectContaining({
        jobId: "job-1",
        result: { sent: true }
      })
    }));
  });

  it("writes failed logs and rethrows worker job errors", async () => {
    const job = {
      id: "job-2",
      name: "generate",
      data: { userId: "user-1" },
      attemptsMade: 1
    };

    await expect(runLoggedJob(
      "report-generation",
      job as never,
      async () => {
        throw new Error("LLM unavailable");
      }
    )).rejects.toThrow("LLM unavailable");

    expect(jobMocks.values).toHaveBeenCalledTimes(2);
    expect(jobMocks.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "report-generation",
      status: "failed",
      message: "LLM unavailable",
      metadata: expect.objectContaining({
        jobId: "job-2",
        attemptsMade: 1
      })
    }));
  });
});
