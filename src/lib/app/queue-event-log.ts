import type { QueueJobType } from "@/lib/app/jobs";

export type StalledQueueEvent = {
  jobId?: string;
  prev?: string;
};

export function buildStalledQueueEventLog(type: QueueJobType, event: StalledQueueEvent, observedAt = new Date()) {
  const jobId = event.jobId ? String(event.jobId) : "unknown";
  return {
    type,
    status: "stalled" as const,
    message: `BullMQ stalled job ${jobId} in ${type}`,
    metadata: {
      jobId,
      previousState: event.prev ?? null,
      observedAt: observedAt.toISOString()
    }
  };
}
