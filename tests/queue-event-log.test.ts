import { describe, expect, it } from "vitest";
import { buildStalledQueueEventLog } from "@/lib/app/queue-event-log";

describe("queue event logs", () => {
  it("builds a job log payload for BullMQ stalled events", () => {
    expect(
      buildStalledQueueEventLog(
        "report-generation",
        { jobId: "report-generation--user-1-2026-06-19", prev: "active" },
        new Date("2026-06-19T12:00:00.000Z")
      )
    ).toEqual({
      type: "report-generation",
      status: "stalled",
      message: "BullMQ stalled job report-generation--user-1-2026-06-19 in report-generation",
      metadata: {
        jobId: "report-generation--user-1-2026-06-19",
        previousState: "active",
        observedAt: "2026-06-19T12:00:00.000Z"
      }
    });
  });
});
