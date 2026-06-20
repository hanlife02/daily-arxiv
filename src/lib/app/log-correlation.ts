import { classifyJobFailureReason, type JobFailureReasonCategory } from "@/lib/app/job-health";

export type LogCorrelationKeys = {
  userIds: string[];
  reportIds: string[];
  paperIds: string[];
};

export type LogTimelineEventSource = "job" | "llm" | "email";

export type LogTimelineEvent = {
  source: LogTimelineEventSource;
  label: string;
  status: string;
  message?: string | null;
  createdAt: Date;
};

export type LogTimelineInput = {
  job: {
    type: string;
    status: string;
    message?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  };
  llmCalls: Array<{
    endpoint: string;
    model: string;
    status: string;
    error?: string | null;
    createdAt: Date;
  }>;
  emails: Array<{
    recipient: string;
    subject: string;
    status: string;
    error?: string | null;
    createdAt: Date;
  }>;
};

export type LogRootCauseConfidence = "high" | "medium" | "low";

export type LogRootCauseSummary = {
  category: JobFailureReasonCategory;
  confidence: LogRootCauseConfidence;
  summary: string;
  evidence: string;
  actionHint: string;
  source?: LogTimelineEventSource;
};

const KEY_MAP: Record<string, keyof LogCorrelationKeys> = {
  userId: "userIds",
  reportId: "reportIds",
  paperId: "paperIds"
};

const ROOT_CAUSE_GUIDANCE: Record<JobFailureReasonCategory, { summary: string; actionHint: string }> = {
  auth: {
    summary: "任务失败指向权限、登录态或账号状态问题。",
    actionHint: "检查触发用户是否仍启用、邮箱是否验证、管理员权限和会话状态是否有效。"
  },
  backup: {
    summary: "任务失败指向备份或恢复链路。",
    actionHint: "检查 pg_dump/psql 是否可用、DATABASE_URL 是否指向正确数据库、备份目录权限和磁盘空间。"
  },
  database: {
    summary: "任务失败指向数据库访问或 schema 状态。",
    actionHint: "检查 PostgreSQL 连接、迁移状态、约束错误和相关表是否存在。"
  },
  llm: {
    summary: "任务失败指向 LLM 调用链路。",
    actionHint: "检查用户 LLM 配置、模型名称、供应商状态、代理网络和配额限制。"
  },
  network: {
    summary: "任务失败指向网络或上游连接。",
    actionHint: "检查代理、DNS、目标上游可达性、超时设置和服务器出站网络。"
  },
  pdf: {
    summary: "任务失败指向 PDF 下载或解析。",
    actionHint: "检查论文 PDF 链接是否可访问、缓存是否损坏，并重试对应论文的解析流程。"
  },
  queue: {
    summary: "任务失败指向队列执行或 worker 锁状态。",
    actionHint: "检查 Redis、worker heartbeat、BullMQ stalled/missing lock 日志和重复任务。"
  },
  quota: {
    summary: "任务失败指向调用额度或限流。",
    actionHint: "检查全局、角色级、用户级额度，以及供应商 rate limit 或 429 响应。"
  },
  redis: {
    summary: "任务失败指向 Redis 连接或队列后端。",
    actionHint: "检查 Redis 健康、连接字符串、容器状态和 worker 到 Redis 的网络。"
  },
  smtp: {
    summary: "任务失败指向 SMTP 或邮件发送链路。",
    actionHint: "检查用户 SMTP、管理员 fallback SMTP、收件人状态、发信额度和供应商拒信原因。"
  },
  unknown: {
    summary: "任务失败暂未匹配到明确根因。",
    actionHint: "展开 metadata 并结合事件时间线检查上游错误、用户配置和 worker 日志。"
  }
};

function addKey(target: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target.add(trimmed);
}

function visitMetadata(
  value: unknown,
  keys: Record<keyof LogCorrelationKeys, Set<string>>,
  depth: number
) {
  if (!value || depth > 4) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) {
      visitMetadata(item, keys, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const mapped = KEY_MAP[key];
    if (mapped) addKey(keys[mapped], item);
    if (item && typeof item === "object") {
      visitMetadata(item, keys, depth + 1);
    }
  }
}

export function extractLogCorrelationKeys(metadata: Record<string, unknown>): LogCorrelationKeys {
  const keys = {
    userIds: new Set<string>(),
    reportIds: new Set<string>(),
    paperIds: new Set<string>()
  };
  visitMetadata(metadata, keys, 0);
  return {
    userIds: [...keys.userIds].sort(),
    reportIds: [...keys.reportIds].sort(),
    paperIds: [...keys.paperIds].sort()
  };
}

export function hasLogCorrelationKeys(keys: LogCorrelationKeys) {
  return keys.userIds.length > 0 || keys.reportIds.length > 0 || keys.paperIds.length > 0;
}

export function buildLogTimeline(input: LogTimelineInput, limit = 8): LogTimelineEvent[] {
  return [
    {
      source: "job" as const,
      label: input.job.type,
      status: input.job.status,
      message: input.job.message,
      createdAt: input.job.createdAt
    },
    ...input.llmCalls.map((log) => ({
      source: "llm" as const,
      label: `${log.endpoint}/${log.model}`,
      status: log.status,
      message: log.error,
      createdAt: log.createdAt
    })),
    ...input.emails.map((log) => ({
      source: "email" as const,
      label: log.recipient,
      status: log.status,
      message: log.error ?? log.subject,
      createdAt: log.createdAt
    }))
  ]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.source.localeCompare(right.source))
    .slice(0, limit);
}

function eventCategory(event: LogTimelineEvent): JobFailureReasonCategory | undefined {
  if (event.status === "stalled") return "queue";
  if (event.source === "llm" && event.status === "failed") return "llm";
  if (event.source === "email" && event.status === "failed") return "smtp";
  if (event.source === "job" && event.status === "failed") {
    return classifyJobFailureReason({
      type: event.label,
      message: event.message
    });
  }
  if (event.message) {
    const category = classifyJobFailureReason({
      type: event.label,
      message: event.message
    });
    if (category !== "unknown") return category;
  }
  return undefined;
}

function rootCauseEvidence(event: LogTimelineEvent | undefined, fallbackMessage?: string | null) {
  if (event) {
    const sourceLabel: Record<LogTimelineEventSource, string> = {
      email: "邮件日志",
      job: "任务日志",
      llm: "LLM 日志"
    };
    return `${sourceLabel[event.source]} ${event.label} ${event.status}${event.message ? `：${event.message.slice(0, 160)}` : ""}`;
  }
  return fallbackMessage ? `任务消息：${fallbackMessage.slice(0, 160)}` : "当前任务没有可用错误消息。";
}

export function summarizeLogRootCause(input: {
  job: LogTimelineInput["job"];
  timeline: LogTimelineEvent[];
  category?: JobFailureReasonCategory;
}): LogRootCauseSummary | null {
  if (input.job.status !== "failed" && input.job.status !== "stalled") return null;

  const orderedTimeline = [...input.timeline].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const sourceEvent = orderedTimeline.find((event) => event.status === "failed" || event.status === "stalled")
    ?? orderedTimeline.find((event) => event.message);
  const eventBasedCategory = sourceEvent ? eventCategory(sourceEvent) : undefined;
  const jobCategory = classifyJobFailureReason(input.job);
  const category = eventBasedCategory && (input.category === undefined || input.category === "unknown")
    ? eventBasedCategory
    : input.category ?? jobCategory;
  const guidance = ROOT_CAUSE_GUIDANCE[category];
  const confidence: LogRootCauseConfidence = sourceEvent && category !== "unknown"
    ? "high"
    : category !== "unknown"
      ? "medium"
      : "low";

  return {
    category,
    confidence,
    summary: guidance.summary,
    evidence: rootCauseEvidence(sourceEvent, input.job.message),
    actionHint: guidance.actionHint,
    source: sourceEvent?.source
  };
}
