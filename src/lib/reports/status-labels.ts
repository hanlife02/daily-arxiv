const REPORT_STATUS_LABELS: Record<string, string> = {
  succeeded: "已生成",
  partial_succeeded: "部分生成",
  skipped: "已跳过",
  failed: "失败",
  pending: "等待中"
};

const REPORT_REASON_LABELS: Record<string, string> = {
  summarized: "摘要已生成",
  summarized_with_failures: "部分论文摘要失败",
  llm_not_configured: "未配置 LLM，仅生成论文列表",
  skipped_no_new_papers: "没有匹配的新论文",
  preference_not_configured: "订阅偏好未配置",
  user_not_found: "用户不存在",
  user_disabled: "用户已禁用",
  report_not_succeeded: "日报未成功生成",
  latest_batch_not_available: "最新 arXiv 批次尚未可用"
};

const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: "待发送",
  sent: "已发送",
  failed: "发送失败",
  not_attempted: "未尝试发送",
  skipped_not_applicable: "无需发送",
  skipped_no_new_papers: "无需发送：没有新论文",
  skipped_limit: "已跳过：达到每日上限",
  skipped_no_smtp: "已跳过：未配置 SMTP",
  skipped_email_not_verified: "已跳过：邮箱未验证",
  skipped_recipient_mismatch: "已跳过：收件人不匹配",
  skipped_user_missing: "已跳过：用户不存在",
  skipped_user_notification_disabled: "已跳过：用户通知已禁用",
  skipped_report_version_missing: "已跳过：日报内容缺失"
};

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "已排队",
  started: "执行中",
  succeeded: "成功",
  failed: "失败",
  delayed: "延迟",
  stalled: "已停滞",
  idle: "空闲",
  manual: "手动"
};

const JOB_FAILURE_REASON_LABELS: Record<string, string> = {
  auth: "权限/登录",
  backup: "备份/恢复",
  database: "数据库",
  llm: "LLM",
  network: "网络",
  pdf: "PDF",
  queue: "队列",
  quota: "限额",
  redis: "Redis",
  smtp: "SMTP/邮件",
  unknown: "未分类"
};

const LLM_STATUS_LABELS: Record<string, string> = {
  started: "执行中",
  succeeded: "成功",
  failed: "失败"
};

function fallbackStatusLabel(value: string | null | undefined) {
  return value || "-";
}

export function reportStatusLabel(status: string | null | undefined) {
  if (!status) return "-";
  return REPORT_STATUS_LABELS[status] ?? status;
}

export function reportReasonLabel(reason: string | null | undefined) {
  if (!reason) return "-";
  return REPORT_REASON_LABELS[reason] ?? fallbackStatusLabel(reason);
}

export function emailStatusLabel(status: string | null | undefined) {
  if (!status) return "-";
  const retryMatch = /^retry_(\d+)$/.exec(status);
  if (retryMatch) return `重试中：第 ${retryMatch[1]} 次`;
  return EMAIL_STATUS_LABELS[status] ?? fallbackStatusLabel(status);
}

export function jobStatusLabel(status: string | null | undefined) {
  if (!status) return "-";
  return JOB_STATUS_LABELS[status] ?? fallbackStatusLabel(status);
}

export function jobFailureReasonLabel(reason: string | null | undefined) {
  if (!reason) return "-";
  return JOB_FAILURE_REASON_LABELS[reason] ?? fallbackStatusLabel(reason);
}

export function llmStatusLabel(status: string | null | undefined) {
  if (!status) return "-";
  return LLM_STATUS_LABELS[status] ?? fallbackStatusLabel(status);
}
