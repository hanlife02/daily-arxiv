export type LlmFailureCategory =
  | "auth"
  | "quota"
  | "provider"
  | "network"
  | "timeout"
  | "configuration"
  | "unknown";

export type LlmFailureDescription = {
  category: LlmFailureCategory;
  label: string;
  actionHint: string;
};

export type LlmErrorStreamEvent = {
  error: string;
  errorType: LlmFailureCategory;
  errorLabel: string;
  actionHint: string;
};

export function classifyLlmFailure(error?: string | null): LlmFailureCategory {
  const text = (error ?? "").toLowerCase();
  if (/\b(401|403|unauthorized|forbidden|api key|invalid key|permission|auth)\b/.test(text)) return "auth";
  if (/\b(429|rate limit|too many requests|quota|insufficient_quota|limit exceeded|调用受限|额度)\b/.test(text)) return "quota";
  if (/\b(timeout|timed out|aborterror|deadline)\b/.test(text)) return "timeout";
  if (/\b(fetch failed|network|econn|enotfound|eai_again|refused|socket|proxy|dns)\b/.test(text)) return "network";
  if (/\b(404|model not found|unknown model|invalid model|base url|endpoint|not found)\b/.test(text)) return "configuration";
  if (/\b(500|502|503|504|internal server|bad gateway|service unavailable|overloaded|provider|invalid json|invalid sse|non-sse|malformed|invalid response)\b/.test(text)) return "provider";
  return "unknown";
}

export function llmFailureLabel(category: LlmFailureCategory) {
  const labels: Record<LlmFailureCategory, string> = {
    auth: "鉴权/权限",
    configuration: "配置/模型",
    network: "网络/代理",
    provider: "供应商异常",
    quota: "限流/额度",
    timeout: "超时",
    unknown: "未分类"
  };
  return labels[category];
}

export function llmFailureActionHint(category: LlmFailureCategory) {
  const hints: Record<LlmFailureCategory, string> = {
    auth: "检查用户 LLM API Key、Base URL、供应商权限和账号状态。",
    configuration: "检查模型名称、OpenAI-compatible endpoint 和 Base URL 是否匹配。",
    network: "检查服务器出站网络、DNS、代理和供应商 endpoint 可达性。",
    provider: "检查供应商状态页或切换备用模型，保留响应码样本用于复盘。",
    quota: "检查供应商 rate limit、余额，以及系统全局/角色/用户 AI 阅读额度。",
    timeout: "检查供应商耗时、网络延迟和请求体大小，必要时稍后重试或降低上下文。",
    unknown: "保留错误原文并结合最近任务日志、供应商后台和 worker 日志排查。"
  };
  return hints[category];
}

export function llmFailureUserActionHint(category: LlmFailureCategory) {
  const hints: Record<LlmFailureCategory, string> = {
    auth: "检查个人设置里的 Base URL、模型和 API Key 后重试。",
    configuration: "检查个人设置里的模型名称和 Base URL 是否匹配后重试。",
    network: "供应商或网络可能异常，可以稍后重试或切换模型 endpoint。",
    provider: "供应商响应异常，可以稍后重试或切换备用模型。",
    quota: "稍后重试，或调整 AI 阅读额度/供应商配额后再试。",
    timeout: "请求超时，可以稍后重试；如果频繁发生，减少上下文或切换模型 endpoint。",
    unknown: "可以先重试；如果持续失败，请检查模型配置或联系管理员查看 LLM 调用日志。"
  };
  return hints[category];
}

export function describeLlmFailure(error?: string | null): LlmFailureDescription {
  const category = classifyLlmFailure(error);
  return {
    category,
    label: llmFailureLabel(category),
    actionHint: llmFailureActionHint(category)
  };
}

export function describeLlmFailureForUser(error?: string | null): LlmFailureDescription {
  const category = classifyLlmFailure(error);
  return {
    category,
    label: llmFailureLabel(category),
    actionHint: llmFailureUserActionHint(category)
  };
}

export function buildLlmErrorStreamEvent(error: string): LlmErrorStreamEvent {
  const description = describeLlmFailureForUser(error);
  return {
    error,
    errorType: description.category,
    errorLabel: description.label,
    actionHint: description.actionHint
  };
}
