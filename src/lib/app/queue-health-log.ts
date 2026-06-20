import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";

export const QUEUE_HEALTH_LOG_TYPE = "queue-health";
export const DEFAULT_QUEUE_HEALTH_LOG_INTERVAL_MS = 30 * 60 * 1000;

type QueueCounts = Partial<Record<"waiting" | "active" | "delayed" | "failed" | "waiting-children", number>>;

type QueueHealthLogInput = {
  name: string;
  ok: boolean;
  counts?: QueueCounts;
};

type QueueHealthLogRow = {
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type QueueHealthTrendPoint = {
  createdAt: Date;
  observedAt: string;
  totalWaiting: number;
  totalActive: number;
  totalDelayed: number;
  totalFailed: number;
  totalWaitingChildren: number;
  totalBacklog: number;
};

export type QueueHealthTrend = {
  points: QueueHealthTrendPoint[];
  latest?: QueueHealthTrendPoint;
  previous?: QueueHealthTrendPoint;
  backlogDelta: number;
  maxBacklog: number;
};

function countValue(counts: QueueCounts | undefined, key: keyof QueueCounts) {
  const value = Number(counts?.[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function metadataNumber(metadata: Record<string, unknown>, key: keyof QueueHealthTrendPoint) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function queueHealthLogIntervalMs() {
  const parsed = Number(process.env.QUEUE_HEALTH_LOG_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_QUEUE_HEALTH_LOG_INTERVAL_MS;
}

export function buildQueueHealthLog(queues: QueueHealthLogInput[], observedAt = new Date()) {
  const queueSummaries = queues.map((queue) => {
    const waiting = countValue(queue.counts, "waiting");
    const delayed = countValue(queue.counts, "delayed");
    const waitingChildren = countValue(queue.counts, "waiting-children");
    return {
      name: queue.name,
      ok: queue.ok,
      waiting,
      active: countValue(queue.counts, "active"),
      delayed,
      failed: countValue(queue.counts, "failed"),
      waitingChildren,
      backlog: waiting + delayed + waitingChildren
    };
  });

  const totals = queueSummaries.reduce(
    (total, queue) => ({
      totalWaiting: total.totalWaiting + queue.waiting,
      totalActive: total.totalActive + queue.active,
      totalDelayed: total.totalDelayed + queue.delayed,
      totalFailed: total.totalFailed + queue.failed,
      totalWaitingChildren: total.totalWaitingChildren + queue.waitingChildren,
      totalBacklog: total.totalBacklog + queue.backlog
    }),
    {
      totalWaiting: 0,
      totalActive: 0,
      totalDelayed: 0,
      totalFailed: 0,
      totalWaitingChildren: 0,
      totalBacklog: 0
    }
  );

  return {
    type: QUEUE_HEALTH_LOG_TYPE,
    status: "succeeded",
    message: `Queue health snapshot: backlog ${totals.totalBacklog}, active ${totals.totalActive}, failed ${totals.totalFailed}`,
    metadata: {
      observedAt: observedAt.toISOString(),
      ...totals,
      queues: queueSummaries
    }
  };
}

export async function recordQueueHealthSnapshot(queues: QueueHealthLogInput[], observedAt = new Date()) {
  const [{ db }, { jobLog }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema")
  ]);
  const latest = await db.query.jobLog.findFirst({
    where: eq(jobLog.type, QUEUE_HEALTH_LOG_TYPE),
    orderBy: desc(jobLog.createdAt)
  });
  if (latest && observedAt.getTime() - latest.createdAt.getTime() < queueHealthLogIntervalMs()) {
    return { recorded: false, reason: "throttled" as const };
  }

  const log = buildQueueHealthLog(queues, observedAt);
  await db.insert(jobLog).values({
    id: randomUUID(),
    type: log.type,
    status: log.status,
    message: log.message,
    metadata: log.metadata
  });
  return { recorded: true, reason: "recorded" as const };
}

export function summarizeQueueHealthTrend(rows: QueueHealthLogRow[]): QueueHealthTrend {
  const points = rows
    .map((row) => ({
      createdAt: row.createdAt,
      observedAt: typeof row.metadata.observedAt === "string" ? row.metadata.observedAt : row.createdAt.toISOString(),
      totalWaiting: metadataNumber(row.metadata, "totalWaiting"),
      totalActive: metadataNumber(row.metadata, "totalActive"),
      totalDelayed: metadataNumber(row.metadata, "totalDelayed"),
      totalFailed: metadataNumber(row.metadata, "totalFailed"),
      totalWaitingChildren: metadataNumber(row.metadata, "totalWaitingChildren"),
      totalBacklog: metadataNumber(row.metadata, "totalBacklog")
    }))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const latest = points.at(-1);
  const previous = points.at(-2);

  return {
    points,
    latest,
    previous,
    backlogDelta: latest && previous ? latest.totalBacklog - previous.totalBacklog : 0,
    maxBacklog: Math.max(0, ...points.map((point) => point.totalBacklog))
  };
}
