export type LlmUsageTokens = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = nonNegativeInteger(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function hasUsageTokens(tokens: LlmUsageTokens) {
  return tokens.promptTokens !== undefined || tokens.completionTokens !== undefined || tokens.totalTokens !== undefined;
}

export function normalizeLlmUsageTokens(value: unknown): LlmUsageTokens | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const promptTokens = firstNumber(record, ["prompt_tokens", "promptTokens", "input_tokens", "inputTokens"]);
  const completionTokens = firstNumber(record, ["completion_tokens", "completionTokens", "output_tokens", "outputTokens"]);
  const totalTokens = firstNumber(record, ["total_tokens", "totalTokens", "tokens", "token_count", "tokenCount"])
    ?? (promptTokens !== undefined || completionTokens !== undefined ? (promptTokens ?? 0) + (completionTokens ?? 0) : undefined);
  const tokens = { promptTokens, completionTokens, totalTokens };
  return hasUsageTokens(tokens) ? tokens : undefined;
}

export function extractLlmUsageTokens(value: unknown): LlmUsageTokens | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return normalizeLlmUsageTokens(record.usage) ?? normalizeLlmUsageTokens(record);
}
