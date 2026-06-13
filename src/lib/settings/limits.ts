export const DEFAULT_LIMITS = {
  automaticReportTopNMax: 10,
  manualSummariesPerUserPerDay: 50,
  concurrentSummaryJobsPerUser: 1
};

export function clampTopN(requested: number, max = DEFAULT_LIMITS.automaticReportTopNMax) {
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}
