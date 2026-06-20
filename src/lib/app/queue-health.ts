export const BACKLOG_JOB_TYPES = ["waiting", "delayed", "prioritized", "waiting-children"] as const;
export const LONG_RUNNING_ACTIVE_JOB_MS = 2 * 60 * 60 * 1000;

export type BacklogJobType = typeof BACKLOG_JOB_TYPES[number];

export type QueueBacklogJobInput = {
  id?: string;
  name: string;
  state: string;
  timestamp?: number;
  delay?: number;
};

export type QueueBacklogSummary = {
  id?: string;
  name: string;
  state: BacklogJobType;
  timestamp: number;
  waitingMs: number;
  delayedUntil?: number;
};

export type QueueObservedJobInput = QueueBacklogJobInput & {
  data?: unknown;
  failedReason?: string;
  attemptsMade?: number;
  processedOn?: number;
  finishedOn?: number;
};

export type QueueFailedJobSummary = {
  id?: string;
  name: string;
  failedReason?: string;
  attemptsMade?: number;
  failedAt: number;
  failedForMs: number;
};

export type QueueActiveJobSummary = {
  id?: string;
  name: string;
  attemptsMade?: number;
  processedOn: number;
  activeMs: number;
};

export type QueueDuplicateJobSummary = {
  fingerprint: string;
  name: string;
  count: number;
  ids: string[];
  states: string[];
};

function isBacklogJobType(state: string): state is BacklogJobType {
  return (BACKLOG_JOB_TYPES as readonly string[]).includes(state);
}

function delayedUntilFor(job: QueueBacklogJobInput) {
  const timestamp = Number(job.timestamp ?? 0);
  const delay = Number(job.delay ?? 0);
  return delay > 0 ? timestamp + delay : undefined;
}

function backlogAgeFor(job: QueueBacklogJobInput, state: BacklogJobType, nowMs: number) {
  const timestamp = Number(job.timestamp ?? 0);
  const delayedUntil = state === "delayed" ? delayedUntilFor(job) : undefined;
  const compareAt = delayedUntil ?? timestamp;
  return Math.max(0, nowMs - compareAt);
}

export function summarizeQueueBacklogJobs(jobs: QueueBacklogJobInput[], nowMs = Date.now()): QueueBacklogSummary | undefined {
  let oldest: QueueBacklogSummary | undefined;
  for (const job of jobs) {
    if (!isBacklogJobType(job.state)) continue;
    const timestamp = Number(job.timestamp ?? 0);
    const waitingMs = backlogAgeFor(job, job.state, nowMs);
    const candidate: QueueBacklogSummary = {
      id: job.id,
      name: job.name,
      state: job.state,
      timestamp,
      waitingMs,
      delayedUntil: job.state === "delayed" ? delayedUntilFor(job) : undefined
    };
    if (!oldest || candidate.waitingMs > oldest.waitingMs) {
      oldest = candidate;
    }
  }
  return oldest;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

function duplicateFingerprint(job: QueueObservedJobInput) {
  return `${job.name}:${stableStringify(job.data ?? {})}`;
}

export function summarizeOldestFailedJob(jobs: QueueObservedJobInput[], nowMs = Date.now()): QueueFailedJobSummary | undefined {
  let oldest: QueueFailedJobSummary | undefined;
  for (const job of jobs) {
    if (job.state !== "failed") continue;
    const failedAt = Number(job.finishedOn ?? job.timestamp ?? 0);
    const candidate: QueueFailedJobSummary = {
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      failedAt,
      failedForMs: Math.max(0, nowMs - failedAt)
    };
    if (!oldest || candidate.failedAt < oldest.failedAt) {
      oldest = candidate;
    }
  }
  return oldest;
}

export function summarizeLongRunningActiveJob(
  jobs: QueueObservedJobInput[],
  nowMs = Date.now(),
  thresholdMs = LONG_RUNNING_ACTIVE_JOB_MS
): QueueActiveJobSummary | undefined {
  let longest: QueueActiveJobSummary | undefined;
  for (const job of jobs) {
    if (job.state !== "active" || !job.processedOn) continue;
    const processedOn = Number(job.processedOn);
    const activeMs = Math.max(0, nowMs - processedOn);
    if (activeMs < thresholdMs) continue;
    const candidate: QueueActiveJobSummary = {
      id: job.id,
      name: job.name,
      attemptsMade: job.attemptsMade,
      processedOn,
      activeMs
    };
    if (!longest || candidate.activeMs > longest.activeMs) {
      longest = candidate;
    }
  }
  return longest;
}

export function summarizeDuplicateQueueJobs(jobs: QueueObservedJobInput[], limit = 3): QueueDuplicateJobSummary[] {
  const groups = new Map<string, QueueDuplicateJobSummary>();
  for (const job of jobs) {
    if (job.state === "failed" || job.state === "completed" || job.state === "succeeded") continue;
    const fingerprint = duplicateFingerprint(job);
    const group = groups.get(fingerprint) ?? {
      fingerprint,
      name: job.name,
      count: 0,
      ids: [],
      states: []
    };
    group.count += 1;
    if (job.id) group.ids.push(job.id);
    if (!group.states.includes(job.state)) group.states.push(job.state);
    groups.set(fingerprint, group);
  }
  return [...groups.values()]
    .filter((group) => group.count > 1)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}
