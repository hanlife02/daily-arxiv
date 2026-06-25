export const DEFAULT_LIMITS = {
  automaticReportTopNMax: 10,
  manualSummariesPerUserPerDay: 50,
  concurrentSummaryJobsPerUser: 1
};

export function clampTopN(requested: number, max = DEFAULT_LIMITS.automaticReportTopNMax) {
  if (!Number.isFinite(requested)) return 1;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}

export function normalizeManualLlmLimits(input: {
  manualLlmCallsPerUserPerDay?: number | null;
  concurrentManualLlmCallsPerUser?: number | null;
}) {
  const daily = input.manualLlmCallsPerUserPerDay ?? DEFAULT_LIMITS.manualSummariesPerUserPerDay;
  const concurrent = input.concurrentManualLlmCallsPerUser ?? DEFAULT_LIMITS.concurrentSummaryJobsPerUser;
  return {
    manualLlmCallsPerUserPerDay: Math.max(0, Math.floor(Number.isFinite(daily) ? daily : DEFAULT_LIMITS.manualSummariesPerUserPerDay)),
    concurrentManualLlmCallsPerUser: Math.max(0, Math.floor(Number.isFinite(concurrent) ? concurrent : DEFAULT_LIMITS.concurrentSummaryJobsPerUser))
  };
}

function roleManualLimit(input: {
  role?: string | null;
  userRoleManualLlmCallsPerUserPerDay?: number | null;
  adminRoleManualLlmCallsPerUserPerDay?: number | null;
}) {
  if (input.role === "admin") return input.adminRoleManualLlmCallsPerUserPerDay;
  if (input.role === "user") return input.userRoleManualLlmCallsPerUserPerDay;
  return undefined;
}

function roleConcurrentLimit(input: {
  role?: string | null;
  userRoleConcurrentManualLlmCallsPerUser?: number | null;
  adminRoleConcurrentManualLlmCallsPerUser?: number | null;
}) {
  if (input.role === "admin") return input.adminRoleConcurrentManualLlmCallsPerUser;
  if (input.role === "user") return input.userRoleConcurrentManualLlmCallsPerUser;
  return undefined;
}

export function resolveManualLlmLimits(input: {
  globalManualLlmCallsPerUserPerDay?: number | null;
  globalConcurrentManualLlmCallsPerUser?: number | null;
  role?: string | null;
  userRoleManualLlmCallsPerUserPerDay?: number | null;
  userRoleConcurrentManualLlmCallsPerUser?: number | null;
  adminRoleManualLlmCallsPerUserPerDay?: number | null;
  adminRoleConcurrentManualLlmCallsPerUser?: number | null;
  userManualLlmCallsPerUserPerDayOverride?: number | null;
  userConcurrentManualLlmCallsPerUserOverride?: number | null;
}) {
  const roleDaily = roleManualLimit(input);
  const roleConcurrent = roleConcurrentLimit(input);
  return normalizeManualLlmLimits({
    manualLlmCallsPerUserPerDay:
      input.userManualLlmCallsPerUserPerDayOverride ?? roleDaily ?? input.globalManualLlmCallsPerUserPerDay,
    concurrentManualLlmCallsPerUser:
      input.userConcurrentManualLlmCallsPerUserOverride ?? roleConcurrent ?? input.globalConcurrentManualLlmCallsPerUser
  });
}

export function summarizeManualLlmQuota(input: {
  usedToday: number;
  running: number;
  manualLlmCallsPerUserPerDay?: number | null;
  concurrentManualLlmCallsPerUser?: number | null;
}) {
  const limits = normalizeManualLlmLimits(input);
  const usedToday = Math.max(0, Math.floor(Number.isFinite(input.usedToday) ? input.usedToday : 0));
  const running = Math.max(0, Math.floor(Number.isFinite(input.running) ? input.running : 0));
  const remainingToday = Math.max(0, limits.manualLlmCallsPerUserPerDay - usedToday);
  const dailyExceeded = usedToday >= limits.manualLlmCallsPerUserPerDay;
  const concurrentExceeded = running >= limits.concurrentManualLlmCallsPerUser;
  return {
    ...limits,
    usedToday,
    remainingToday,
    running,
    dailyExceeded,
    concurrentExceeded,
    blocked: dailyExceeded || concurrentExceeded
  };
}
