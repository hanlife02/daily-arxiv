import { desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";
import { listBackupFiles } from "@/lib/app/backups";
import {
  getBackupQueue,
  getCrawlQueue,
  getEmailQueue,
  getReportQueue,
  getRetentionQueue
} from "@/lib/jobs/queues";
import { readSchedulerHeartbeat, readWorkerHeartbeat } from "@/lib/app/worker-health";
import {
  JOB_CONSECUTIVE_FAILURE_ALERT,
  JOB_FAILURE_MIN_TERMINAL_COUNT,
  JOB_FAILURE_RATE_ALERT,
  JOB_FAILURE_WINDOW_HOURS,
  summarizeJobFailures
} from "@/lib/app/job-health";
import {
  BACKLOG_JOB_TYPES,
  type QueueActiveJobSummary,
  type QueueBacklogSummary,
  type QueueDuplicateJobSummary,
  type QueueFailedJobSummary,
  type QueueObservedJobInput,
  summarizeDuplicateQueueJobs,
  summarizeLongRunningActiveJob,
  summarizeOldestFailedJob,
  summarizeQueueBacklogJobs
} from "@/lib/app/queue-health";

const QUEUE_COUNT_TYPES = ["waiting", "active", "delayed", "failed", "paused", "prioritized", "waiting-children"] as const;
const QUEUE_OBSERVED_JOB_TYPES = [...BACKLOG_JOB_TYPES, "active", "failed"] as const;

type QueueCountType = typeof QUEUE_COUNT_TYPES[number];

type QueueSnapshot = {
  name: string;
  ok: boolean;
  counts?: Partial<Record<QueueCountType, number>>;
  oldestBacklogJob?: QueueBacklogSummary;
  oldestFailedJob?: QueueFailedJobSummary;
  longRunningActiveJob?: QueueActiveJobSummary;
  duplicateJobs?: QueueDuplicateJobSummary[];
  message?: string;
};

async function getQueueSnapshots(): Promise<QueueSnapshot[]> {
  const queues = [
    { name: "arxiv-crawl", queue: getCrawlQueue() },
    { name: "report-generation", queue: getReportQueue() },
    { name: "email-notification", queue: getEmailQueue() },
    { name: "backup", queue: getBackupQueue() },
    { name: "data-retention", queue: getRetentionQueue() }
  ];

  const nowMs = Date.now();
  return Promise.all(queues.map(async ({ name, queue }) => {
    try {
      const counts = await queue.getJobCounts(...QUEUE_COUNT_TYPES);
      const observedJobs = await queue.getJobs([...QUEUE_OBSERVED_JOB_TYPES], 0, 30, true);
      const observedJobInputs: QueueObservedJobInput[] = await Promise.all(observedJobs.map(async (job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        state: await job.getState(),
        timestamp: job.timestamp,
        delay: job.delay,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn
      })));
      const oldestBacklogJob = summarizeQueueBacklogJobs(observedJobInputs, nowMs);
      const oldestFailedJob = summarizeOldestFailedJob(observedJobInputs, nowMs);
      const longRunningActiveJob = summarizeLongRunningActiveJob(observedJobInputs, nowMs);
      const duplicateJobs = summarizeDuplicateQueueJobs(observedJobInputs);
      return { name, ok: true, counts, oldestBacklogJob, oldestFailedJob, longRunningActiveJob, duplicateJobs };
    } catch (error) {
      return {
        name,
        ok: false,
        message: error instanceof Error ? error.message : "queue unavailable"
      };
    }
  }));
}

export async function getSystemHealth() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  try {
    await db.execute(sql`select 1`);
    checks.postgres = { ok: true, message: "connected" };
  } catch (error) {
    checks.postgres = { ok: false, message: error instanceof Error ? error.message : "postgres failed" };
  }

  try {
    const client = await getCrawlQueue().client as unknown as { ping: () => Promise<unknown> };
    await client.ping();
    checks.redis = { ok: true, message: "connected" };
  } catch (error) {
    checks.redis = { ok: false, message: error instanceof Error ? error.message : "redis failed" };
  }

  const now = new Date();
  const jobWindowStart = new Date(now.getTime() - JOB_FAILURE_WINDOW_HOURS * 60 * 60 * 1000);
  const [lastJobs, recentJobRows] = await Promise.all([
    db.query.jobLog.findMany({ orderBy: desc(jobLog.createdAt), limit: 10 }).catch(() => []),
    db.query.jobLog.findMany({
      where: gte(jobLog.createdAt, jobWindowStart),
      orderBy: desc(jobLog.createdAt),
      limit: 500
    }).catch(() => [])
  ]);
  const jobFailures = summarizeJobFailures(recentJobRows);
  const alertingFailures = jobFailures.filter((item) => item.alert);
  const backups = listBackupFiles(1);
  const worker = readWorkerHeartbeat();
  const scheduler = readSchedulerHeartbeat();
  checks.backup = backups.length > 0
    ? { ok: true, message: backups[0].createdAt.toISOString() }
    : { ok: false, message: "no backups found" };
  checks.worker = { ok: worker.ok, message: worker.message };
  checks.scheduler = { ok: scheduler.ok, message: scheduler.message };
  checks.jobs = {
    ok: alertingFailures.length === 0,
    message: alertingFailures.length === 0
      ? `no job failure alerts in ${JOB_FAILURE_WINDOW_HOURS}h`
      : `${alertingFailures.length} job type(s) over failure threshold`
  };

  const queues = await getQueueSnapshots();
  const totalWaiting = queues.reduce((total, queue) => total + (queue.counts?.waiting ?? 0), 0);
  const totalActive = queues.reduce((total, queue) => total + (queue.counts?.active ?? 0), 0);
  const totalDelayed = queues.reduce((total, queue) => total + (queue.counts?.delayed ?? 0), 0);
  const totalFailed = queues.reduce((total, queue) => total + (queue.counts?.failed ?? 0), 0);
  const totalWaitingChildren = queues.reduce((total, queue) => total + (queue.counts?.["waiting-children"] ?? 0), 0);
  const queuesOk = queues.every((queue) => queue.ok);
  checks.queues = {
    ok: queuesOk,
    message: queuesOk
      ? `waiting ${totalWaiting}, active ${totalActive}, delayed ${totalDelayed}, failed ${totalFailed}, waiting-children ${totalWaitingChildren}`
      : "one or more queues unavailable"
  };

  return {
    ok: Object.values(checks).every((check) => check.ok),
    checks,
    worker,
    scheduler,
    queues,
    jobFailures,
    jobFailureWindowHours: JOB_FAILURE_WINDOW_HOURS,
    jobFailureThresholds: {
      failureRate: JOB_FAILURE_RATE_ALERT,
      minTerminalCount: JOB_FAILURE_MIN_TERMINAL_COUNT,
      consecutiveFailures: JOB_CONSECUTIVE_FAILURE_ALERT
    },
    lastJobs: lastJobs.map((job) => ({
      type: job.type,
      status: job.status,
      message: job.message,
      createdAt: job.createdAt
    }))
  };
}
