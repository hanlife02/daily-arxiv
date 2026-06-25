export type LlmEndpoint = "report-summary" | "read-summary" | "read-chat";

export const MANUAL_LLM_ENDPOINTS = ["read-summary", "read-chat"] as const satisfies readonly LlmEndpoint[];
export type ManualLlmEndpoint = (typeof MANUAL_LLM_ENDPOINTS)[number];

export function isManualLlmEndpoint(endpoint: string): endpoint is ManualLlmEndpoint {
  return MANUAL_LLM_ENDPOINTS.includes(endpoint as ManualLlmEndpoint);
}
