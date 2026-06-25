import { QueueEvents } from "bullmq";
import { logJob, type QueueJobType } from "@/lib/app/jobs";
import { buildStalledQueueEventLog, type StalledQueueEvent } from "@/lib/app/queue-event-log";
import { redisConnection } from "@/lib/jobs/queues";

const QUEUE_EVENT_TYPES: QueueJobType[] = [
  "arxiv-crawl",
  "report-generation",
  "email-notification",
  "backup",
  "data-retention"
];

function logQueueEventError(type: QueueJobType, error: unknown) {
  console.error(`daily-arxiv queue event logging failed for ${type}`, error);
}

export function startQueueEventLogging() {
  const queueEvents = QUEUE_EVENT_TYPES.map((type) => {
    const events = new QueueEvents(type, { connection: redisConnection });

    events.on("stalled", (event: StalledQueueEvent) => {
      void logJob(buildStalledQueueEventLog(type, event)).catch((error) => logQueueEventError(type, error));
    });

    events.on("error", (error) => logQueueEventError(type, error));

    return events;
  });

  return async () => {
    await Promise.all(queueEvents.map((events) => events.close()));
  };
}
