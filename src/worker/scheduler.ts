import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { report, user, userPreference } from "@/lib/db/schema";
import { enqueueBackupJob, enqueueCrawlJob, enqueueReportJob, enqueueRetentionJob, logJob } from "@/lib/app/jobs";
import { defaultBatchDate } from "@/lib/app/reports";
import { decideBatchReadiness } from "@/lib/reports/batch";
import { getAdminSettings } from "@/lib/app/settings";
import { isDueSendTime } from "@/lib/jobs/schedule";
import { writeSchedulerHeartbeat, type SchedulerTickSummary } from "@/lib/app/worker-health";

const DEFAULT_SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_CRAWL_INTERVAL_MS = 6 * 60 * 60 * 1000;

type SchedulerState = {
  lastCrawlAt?: number;
  lastBackupDate?: string;
  lastRetentionDate?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures?: number;
};

const state: SchedulerState = {};

function numberFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function enqueueDueReports(now = new Date()) {
  const batchDate = defaultBatchDate(now);
  const latestBatchAvailableAt = new Date(`${batchDate}T12:00:00.000Z`);
  const readiness = decideBatchReadiness(now, latestBatchAvailableAt);
  if (readiness.action === "delay") {
    await logJob({
      type: "report-generation",
      status: "delayed",
      message: "Latest arXiv batch is not available yet",
      metadata: {
        batchDate,
        retryAfter: readiness.retryAfter.toISOString()
      }
    });
    return 0;
  }

  const rows = await db
    .select({ preference: userPreference })
    .from(userPreference)
    .innerJoin(user, eq(userPreference.userId, user.id))
    .where(eq(user.disabled, false));
  let queued = 0;

  for (const { preference } of rows) {
    if (preference.categories.length === 0) continue;
    if (!isDueSendTime(preference.sendTime, preference.timezone, now)) continue;

    const existing = await db.query.report.findFirst({
      where: and(eq(report.userId, preference.userId), eq(report.batchDate, batchDate))
    });
    if (existing) continue;

    await enqueueReportJob({
      userId: preference.userId,
      batchDate,
      requestedBy: "scheduler"
    });
    queued += 1;
  }

  if (queued > 0) {
    await logJob({
      type: "report-generation",
      status: "queued",
      message: `Scheduler queued ${queued} due report jobs`,
      metadata: { batchDate, queued }
    });
  }

  return queued;
}

export async function runSchedulerTick(now = new Date(), schedulerState = state): Promise<SchedulerTickSummary> {
  const crawlIntervalMs = numberFromEnv("ARXIV_CRAWL_INTERVAL_MS", DEFAULT_CRAWL_INTERVAL_MS);
  const nowMs = now.getTime();
  const summary: SchedulerTickSummary = {
    crawlQueued: false,
    reportsQueued: 0,
    backupQueued: false,
    retentionQueued: false
  };

  if (!schedulerState.lastCrawlAt || nowMs - schedulerState.lastCrawlAt >= crawlIntervalMs) {
    const settings = await getAdminSettings();
    await enqueueCrawlJob({
      maxResultsPerCategory: settings.arxivMaxResultsPerCategory,
      requestedBy: "scheduler"
    });
    schedulerState.lastCrawlAt = nowMs;
    summary.crawlQueued = true;
  }

  summary.reportsQueued = await enqueueDueReports(now);

  const dateKey = now.toISOString().slice(0, 10);
  if (schedulerState.lastBackupDate !== dateKey) {
    await enqueueBackupJob({ requestedBy: "scheduler" });
    schedulerState.lastBackupDate = dateKey;
    summary.backupQueued = true;
  }
  if (schedulerState.lastRetentionDate !== dateKey) {
    await enqueueRetentionJob({ requestedBy: "scheduler" });
    schedulerState.lastRetentionDate = dateKey;
    summary.retentionQueued = true;
  }

  return summary;
}

async function runObservedSchedulerTick(now = new Date(), schedulerState = state) {
  const startedAt = new Date();
  try {
    const summary = await runSchedulerTick(now, schedulerState);
    const finishedAt = new Date();
    schedulerState.consecutiveFailures = 0;
    schedulerState.lastSuccessAt = finishedAt.toISOString();
    writeSchedulerHeartbeat({
      service: "daily-arxiv-scheduler",
      pid: process.pid,
      status: "succeeded",
      updatedAt: finishedAt.toISOString(),
      lastStartedAt: startedAt.toISOString(),
      lastSuccessAt: schedulerState.lastSuccessAt,
      lastFailureAt: schedulerState.lastFailureAt,
      consecutiveFailures: 0,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary
    });
  } catch (error) {
    const finishedAt = new Date();
    schedulerState.consecutiveFailures = (schedulerState.consecutiveFailures ?? 0) + 1;
    schedulerState.lastFailureAt = finishedAt.toISOString();
    writeSchedulerHeartbeat({
      service: "daily-arxiv-scheduler",
      pid: process.pid,
      status: "failed",
      updatedAt: finishedAt.toISOString(),
      lastStartedAt: startedAt.toISOString(),
      lastSuccessAt: schedulerState.lastSuccessAt,
      lastFailureAt: schedulerState.lastFailureAt,
      consecutiveFailures: schedulerState.consecutiveFailures,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error instanceof Error ? error.message : "scheduler tick failed"
    });
    throw error;
  }
}

export function startSchedulers() {
  if (process.env.WORKER_SCHEDULER_DISABLED === "true") {
    writeSchedulerHeartbeat({
      service: "daily-arxiv-scheduler",
      pid: process.pid,
      status: "disabled",
      updatedAt: new Date().toISOString(),
      consecutiveFailures: 0
    });
    return;
  }

  const intervalMs = numberFromEnv("WORKER_SCHEDULER_INTERVAL_MS", DEFAULT_SCHEDULER_INTERVAL_MS);
  void runObservedSchedulerTick().catch((error) => {
    console.error("daily-arxiv scheduler tick failed", error);
  });

  const interval = setInterval(() => {
    void runObservedSchedulerTick().catch((error) => {
      console.error("daily-arxiv scheduler tick failed", error);
    });
  }, intervalMs);

  process.on("SIGTERM", () => clearInterval(interval));
}
