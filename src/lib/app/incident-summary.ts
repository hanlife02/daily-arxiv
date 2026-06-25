import type { JobFailureReasonCategory } from "@/lib/app/job-health";
import type { LlmFailureDiagnostic } from "@/lib/app/llm-usage-summary";

export type OperationalIncidentSeverity = "critical" | "warning" | "info";

export type OperationalIncident = {
  key: string;
  severity: OperationalIncidentSeverity;
  title: string;
  scope: string;
  evidence: string;
  actionHint: string;
  updatedAt?: Date;
};

type HealthCheckInput = {
  ok: boolean;
  message: string;
};

type JobFailureIncidentInput = {
  type: string;
  alert: boolean;
  failedCount: number;
  failureRate: number;
  consecutiveFailures: number;
  lastFailureCategory?: JobFailureReasonCategory;
  lastMessage?: string | null;
  lastAt?: Date;
};

export type OperationalIncidentInput = {
  healthChecks: Record<string, HealthCheckInput>;
  jobFailures: JobFailureIncidentInput[];
  llmFailureDiagnostics: LlmFailureDiagnostic[];
};

const SEVERITY_WEIGHT: Record<OperationalIncidentSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1
};

const HEALTH_LABELS: Record<string, string> = {
  backup: "最近备份",
  jobs: "任务失败",
  postgres: "PostgreSQL",
  queues: "队列",
  redis: "Redis",
  scheduler: "Scheduler",
  worker: "Worker"
};

const HEALTH_ACTIONS: Record<string, string> = {
  backup: "检查备份目录、磁盘空间和最近备份任务日志，必要时手动触发一次备份。",
  jobs: "查看任务失败聚合和任务日志时间线，优先处理连续失败或高失败率任务。",
  postgres: "检查 PostgreSQL 容器、连接串、磁盘空间和迁移状态。",
  queues: "检查 Redis、worker 状态和 BullMQ 队列连接。",
  redis: "检查 Redis 容器、连接串和 worker 到 Redis 的网络。",
  scheduler: "检查 scheduler heartbeat、worker 调度日志和 WORKER_SCHEDULER_DISABLED 配置。",
  worker: "检查 worker heartbeat、容器健康状态和最近 worker 日志。"
};

function healthSeverity(key: string): OperationalIncidentSeverity {
  return ["postgres", "redis", "worker", "scheduler", "queues"].includes(key) ? "critical" : "warning";
}

function jobActionHint(category?: JobFailureReasonCategory) {
  const hints: Record<JobFailureReasonCategory, string> = {
    auth: "检查用户状态、邮箱验证、权限和触发任务的会话来源。",
    backup: "检查 pg_dump/psql、备份目录权限、DATABASE_URL 和磁盘空间。",
    database: "检查 PostgreSQL 连接、schema/migration 状态和约束错误。",
    llm: "检查 LLM 失败诊断、用户模型配置、供应商状态和调用额度。",
    network: "检查 DNS、代理、出站网络和上游服务可达性。",
    pdf: "检查论文 PDF 链接、PDF 缓存和解析错误样本。",
    queue: "检查 Redis、BullMQ stalled/missing lock 日志和重复任务。",
    quota: "检查系统额度、用户/角色额度和供应商 rate limit。",
    redis: "检查 Redis 健康、连接字符串和队列后端状态。",
    smtp: "检查 SMTP 配置、收件人状态、发信额度和供应商拒信原因。",
    unknown: "展开任务 metadata，结合事件时间线、worker 日志和上游响应继续排查。"
  };
  return hints[category ?? "unknown"];
}

function trimEvidence(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text.slice(0, 180) : "暂无错误详情。";
}

export function summarizeOperationalIncidents(input: OperationalIncidentInput, limit = 8): OperationalIncident[] {
  const incidents: OperationalIncident[] = [];

  for (const [key, check] of Object.entries(input.healthChecks)) {
    if (check.ok) continue;
    incidents.push({
      key: `health:${key}`,
      severity: healthSeverity(key),
      title: `${HEALTH_LABELS[key] ?? key} 异常`,
      scope: "系统健康",
      evidence: trimEvidence(check.message),
      actionHint: HEALTH_ACTIONS[key] ?? "查看管理员健康详情和相关任务日志。"
    });
  }

  for (const failure of input.jobFailures) {
    if (!failure.alert) continue;
    incidents.push({
      key: `job:${failure.type}`,
      severity: failure.consecutiveFailures >= 2 ? "critical" : "warning",
      title: `${failure.type} 任务失败告警`,
      scope: "任务队列",
      evidence: `${failure.failedCount} 次失败，失败率 ${(failure.failureRate * 100).toFixed(0)}%，连续失败 ${failure.consecutiveFailures}${failure.lastMessage ? `；${trimEvidence(failure.lastMessage)}` : ""}`,
      actionHint: jobActionHint(failure.lastFailureCategory),
      updatedAt: failure.lastAt
    });
  }

  for (const diagnostic of input.llmFailureDiagnostics) {
    incidents.push({
      key: `llm:${diagnostic.category}`,
      severity: diagnostic.category === "auth" || diagnostic.category === "provider" ? "warning" : "info",
      title: `LLM ${diagnostic.label}失败`,
      scope: "LLM 调用",
      evidence: `${diagnostic.count} 次；${diagnostic.lastEndpoint ?? "unknown"}/${diagnostic.lastModel ?? "unknown"}${diagnostic.lastError ? `：${trimEvidence(diagnostic.lastError)}` : ""}`,
      actionHint: diagnostic.actionHint,
      updatedAt: diagnostic.lastAt
    });
  }

  return incidents
    .sort((left, right) =>
      SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity] ||
      (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0) ||
      left.title.localeCompare(right.title)
    )
    .slice(0, limit);
}
