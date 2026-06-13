import type { PaperRecord } from "@/lib/arxiv/types";
import { parsePaperSummaryResponse, type PaperSummary } from "@/lib/llm/schema";

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const PROMPT_VERSION = "daily-arxiv-v1";

export function buildPaperSummaryPrompt(paper: PaperRecord, focus?: string) {
  return [
    "你是科研论文摘要助手。只根据用户提供的 arXiv 元数据工作，不要补充论文全文中才可能出现的信息。",
    "输出必须是 JSON，不要 Markdown，不要额外解释。",
    "字段：title_original, title_zh, abstract_original, abstract_zh, one_sentence_summary_zh, summary_zh。",
    "one_sentence_summary_zh 必须不超过 30 个中文字符。",
    focus ? `用户关注点：${focus}` : undefined,
    `标题：${paper.title}`,
    `摘要：${paper.abstract}`,
    `作者：${paper.authors.join(", ")}`,
    `分类：${paper.categories.join(", ")}`,
    `链接：${paper.arxivUrl}`
  ]
    .filter(Boolean)
    .join("\n");
}

export async function summarizePaperWithChatCompletions(
  paper: PaperRecord,
  config: LlmConfig,
  focus?: string
): Promise<PaperSummary> {
  const endpoint = new URL("/v1/chat/completions", config.baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你输出严格 JSON。所有中文内容保持简洁。" },
        { role: "user", content: buildPaperSummaryPrompt(paper, focus) }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response has no content");
  }

  return parsePaperSummaryResponse(content);
}
