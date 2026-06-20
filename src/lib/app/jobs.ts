import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";
import {
  getBackupQueue,
  getCrawlQueue,
  getEmailQueue,
  getReportQueue,
  getRetentionQueue,
  type BackupJobData,
  type CrawlJobData,
  type EmailJobData,
  type ReportJobData,
  type RetentionJobData
} from "@/lib/jobs/queues";

type LogStatus = "queued" | "started" | "succeeded" | "failed" | "delayed" | "stalled";

export type QueueJobType = "arxiv-crawl" | "report-generation" | "email-notification" | "backup" | "data-retention";

type EnqueuedJob = {
  type: QueueJobType;
  jobId: string;
};

function jobId(prefix: QueueJobType, suffix: string = randomUUID()) {
  return `${prefix}--${suffix.replace(/:/g, "-")}`;
}

function metadataFor(job: Pick<Job, "id" | "name" | "data" | "attemptsMade">, extra: Record<string, unknown> = {}) {
  return {
    jobId: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    data: job.data,
    ...extra
  };
}

export async function logJob(input: {
  type: QueueJobType;
  status: LogStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(jobLog).values({
    id: randomUUID(),
    type: input.type,
    status: input.status,
    message: input.message,
    metadata: input.metadata ?? {}
  });
}

async function logEnqueued(type: QueueJobType, job: Job) {
  await logJob({
    type,
    status: "queued",
    message: `Queued ${type}`,
    metadata: metadataFor(job)
  });
  return { type, jobId: String(job.id) } satisfies EnqueuedJob;
}

export async function enqueueCrawlJob(data: CrawlJobData = {}) {
  const job = await getCrawlQueue().add("crawl", data, {
    jobId: jobId("arxiv-crawl"),
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });
  return logEnqueued("arxiv-crawl", job);
}

export async function enqueueReportJob(data: ReportJobData = {}) {
  const suffix = data.userId ? `${data.userId}:${data.batchDate ?? "latest"}` : `all:${data.batchDate ?? "latest"}`;
  const job = await getReportQueue().add("generate", data, {
    jobId: data.requestedBy === "scheduler" ? jobId("report-generation", suffix) : jobId("report-generation"),
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100
  });
  return logEnqueued("report-generation", job);
}

export async function enqueueEmailJob(data: EmailJobData) {
  const job = await getEmailQueue().add("send", data, {
    jobId: jobId("email-notification", data.reportId),
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100
  });
  return logEnqueued("email-notification", job);
}

export async function enqueueBackupJob(data: BackupJobData = {}) {
  const job = await getBackupQueue().add("backup", data, {
    jobId: jobId("backup"),
    attempts: 1,
    removeOnComplete: 30,
    removeOnFail: 30
  });
  return logEnqueued("backup", job);
}

export async function enqueueRetentionJob(data: RetentionJobData = {}) {
  const job = await getRetentionQueue().add("cleanup", data, {
    jobId: jobId("data-retention"),
    attempts: 1,
    removeOnComplete: 30,
    removeOnFail: 30
  });
  return logEnqueued("data-retention", job);
}

export async function runLoggedJob<T>(
  type: QueueJobType,
  job: Job,
  run: () => Promise<T>,
  message: (result: T) => string = () => `${type} succeeded`
) {
  const startedAt = new Date();
  await logJob({
    type,
    status: "started",
    message: `Started ${type}`,
    metadata: metadataFor(job, { startedAt: startedAt.toISOString() })
  });

  try {
    const result = await run();
    const finishedAt = new Date();
    await logJob({
      type,
      status: "succeeded",
      message: message(result),
      metadata: metadataFor(job, {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        result
      })
    });
    return result;
  } catch (error) {
    const finishedAt = new Date();
    await logJob({
      type,
      status: "failed",
      message: error instanceof Error ? error.message : `${type} failed`,
      metadata: metadataFor(job, {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime()
      })
    });
    throw error;
  }
}
