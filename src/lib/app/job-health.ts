export const JOB_FAILURE_WINDOW_HOURS = 24;
export const JOB_FAILURE_RATE_ALERT = 0.25;
export const JOB_FAILURE_MIN_TERMINAL_COUNT = 4;
export const JOB_CONSECUTIVE_FAILURE_ALERT = 2;

type JobTerminalStatus = "succeeded" | "failed";

export type JobFailureReasonCategory =
  | "auth"
  | "backup"
  | "database"
  | "llm"
  | "network"
  | "pdf"
  | "queue"
  | "quota"
  | "redis"
  | "smtp"
  | "unknown";

export type JobFailureCategorySummary = {
  category: JobFailureReasonCategory;
  count: number;
  lastMessage?: string | null;
  lastAt?: Date;
};

export type JobFailureSummary = {
  type: string;
  terminalCount: number;
  failedCount: number;
  succeededCount: number;
  failureRate: number;
  consecutiveFailures: number;
  failureCategories: JobFailureCategorySummary[];
  lastFailureCategory?: JobFailureReasonCategory;
  alert: boolean;
  lastStatus?: JobTerminalStatus;
  lastMessage?: string | null;
  lastAt?: Date;
};

type JobFailureInput = {
  type: string;
  status: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

function isTerminalStatus(status: string): status is JobTerminalStatus {
  return status === "succeeded" || status === "failed";
}

function lowerFailureText(input: Pick<JobFailureInput, "type" | "message" | "metadata">) {
  return [
    input.type,
    input.message ?? "",
    input.metadata ? JSON.stringify(input.metadata).slice(0, 2000) : ""
  ].join(" ").toLowerCase();
}

export function classifyJobFailureReason(input: Pick<JobFailureInput, "type" | "message" | "metadata">): JobFailureReasonCategory {
  const text = lowerFailureText(input);
  if (/\b(unauthorized|forbidden|permission|not allowed|auth|session)\b/.test(text)) return "auth";
  if (/\b(pg_dump|backup|restore|dump)\b/.test(text) || input.type === "backup") return "backup";
  if (/\b(postgres|postgresql|psql|database|sql|drizzle|relation|constraint)\b/.test(text)) return "database";
  if (/\b(redis|ioredis)\b/.test(text)) return "redis";
  if (/\b(bullmq|queue|stalled|job lock|missing lock)\b/.test(text)) return "queue";
  if (/\b(smtp|email|mail|recipient|nodemailer)\b/.test(text) || input.type === "email-notification") return "smtp";
  if (/\b(openai|llm|model|completion|chat|prompt|token)\b/.test(text)) return "llm";
  if (/\b(pdf|parse pdf|download pdf)\b/.test(text)) return "pdf";
  if (/\b(quota|limit|rate limit|too many requests|429)\b/.test(text)) return "quota";
  if (/\b(fetch|network|timeout|timed out|econn|enotfound|refused|socket|proxy)\b/.test(text)) return "network";
  return "unknown";
}

function summarizeFailureCategories(items: JobFailureInput[]): JobFailureCategorySummary[] {
  const categories = new Map<JobFailureReasonCategory, JobFailureCategorySummary>();
  for (const item of items) {
    if (item.status !== "failed") continue;
    const category = classifyJobFailureReason(item);
    const previous = categories.get(category);
    if (!previous || item.createdAt > (previous.lastAt ?? new Date(0))) {
      categories.set(category, {
        category,
        count: (previous?.count ?? 0) + 1,
        lastMessage: item.message,
        lastAt: item.createdAt
      });
    } else {
      previous.count += 1;
    }
  }
  return [...categories.values()]
    .sort((a, b) => b.count - a.count || (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) || a.category.localeCompare(b.category));
}

export function summarizeJobFailures(rows: JobFailureInput[]): JobFailureSummary[] {
  const byType = new Map<string, JobFailureInput[]>();
  for (const row of rows) {
    if (!isTerminalStatus(row.status)) continue;
    byType.set(row.type, [...(byType.get(row.type) ?? []), row]);
  }

  return [...byType.entries()]
    .map(([type, items]) => {
      const ordered = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const failedCount = ordered.filter((item) => item.status === "failed").length;
      const succeededCount = ordered.length - failedCount;
      let consecutiveFailures = 0;
      for (const item of ordered) {
        if (item.status !== "failed") break;
        consecutiveFailures += 1;
      }
      const failureRate = ordered.length > 0 ? failedCount / ordered.length : 0;
      const alert = consecutiveFailures >= JOB_CONSECUTIVE_FAILURE_ALERT
        || (ordered.length >= JOB_FAILURE_MIN_TERMINAL_COUNT && failureRate >= JOB_FAILURE_RATE_ALERT);
      const last = ordered[0];
      const failureCategories = summarizeFailureCategories(ordered);
      const lastFailure = ordered.find((item) => item.status === "failed");
      return {
        type,
        terminalCount: ordered.length,
        failedCount,
        succeededCount,
        failureRate,
        consecutiveFailures,
        failureCategories,
        lastFailureCategory: lastFailure ? classifyJobFailureReason(lastFailure) : undefined,
        alert,
        lastStatus: last?.status as JobTerminalStatus | undefined,
        lastMessage: last?.message,
        lastAt: last?.createdAt
      };
    })
    .sort((a, b) => Number(b.alert) - Number(a.alert) || b.consecutiveFailures - a.consecutiveFailures || b.failureRate - a.failureRate || a.type.localeCompare(b.type));
}
