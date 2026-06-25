export const INCIDENT_HISTORY_LOG_TYPE = "health-alert";

export type IncidentHistoryLogInput = {
  id: string;
  status: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

export type IncidentHistorySnapshot = {
  id: string;
  status: string;
  message?: string | null;
  fingerprint: string;
  items: string[];
  deliverySummary: string;
  reviewDraft: string;
  createdAt: Date;
};

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function deliveryChannelSummary(label: string, value: unknown) {
  const record = metadataRecord(value);
  if (!record) return `${label} -`;
  if (record.sent === true) {
    return typeof record.sentCount === "number" ? `${label} sent(${record.sentCount})` : `${label} sent`;
  }
  return `${label} ${typeof record.reason === "string" ? record.reason : "not_sent"}`;
}

function buildDeliverySummary(metadata: Record<string, unknown>) {
  return [
    deliveryChannelSummary("email", metadata.email),
    deliveryChannelSummary("webhook", metadata.webhook)
  ].join(" · ");
}

export function buildIncidentReviewDraft(input: {
  createdAt: Date;
  fingerprint: string;
  status: string;
  items: string[];
  message?: string | null;
}) {
  const evidence = input.items.length > 0
    ? input.items.map((item) => `- ${item}`).join("\n")
    : "- 当前快照没有结构化告警项。";
  return [
    "# daily-arxiv 事件复盘草稿",
    "",
    `- 时间：${input.createdAt.toISOString()}`,
    `- 指纹：${input.fingerprint}`,
    `- 记录状态：${input.status}`,
    input.message ? `- 记录消息：${input.message}` : "- 记录消息：无",
    "",
    "## 影响范围",
    "- 待确认：结合生产日志、用户反馈和相关任务记录补充。",
    "",
    "## 证据",
    evidence,
    "",
    "## 初步处置",
    "- 检查管理员后台的系统健康、队列、任务日志、LLM 调用和最近备份。",
    "- 对每个告警项记录根因、修复动作、恢复时间和验证命令。",
    "",
    "## 待补证据",
    "- 目标环境日志片段。",
    "- 相关 job/email/LLM 记录。",
    "- 重试、恢复或降级后的验证结果。"
  ].join("\n");
}

export function summarizeIncidentHistoryLog(log: IncidentHistoryLogInput): IncidentHistorySnapshot {
  const metadata = log.metadata ?? {};
  const items = stringArray(metadata.items);
  const fingerprint = typeof metadata.fingerprint === "string" && metadata.fingerprint.trim()
    ? metadata.fingerprint.trim()
    : log.id;
  return {
    id: log.id,
    status: log.status,
    message: log.message,
    fingerprint,
    items,
    deliverySummary: buildDeliverySummary(metadata),
    reviewDraft: buildIncidentReviewDraft({
      createdAt: log.createdAt,
      fingerprint,
      status: log.status,
      items,
      message: log.message
    }),
    createdAt: log.createdAt
  };
}
