export type BatchDecision =
  | { action: "generate"; reason: "batch_available" }
  | { action: "delay"; reason: "latest_batch_not_available"; retryAfter: Date };

export function decideBatchReadiness(now: Date, latestBatchAvailableAt: Date): BatchDecision {
  if (now.getTime() >= latestBatchAvailableAt.getTime()) {
    return { action: "generate", reason: "batch_available" };
  }
  return {
    action: "delay",
    reason: "latest_batch_not_available",
    retryAfter: latestBatchAvailableAt
  };
}
