import { describe, expect, it } from "vitest";
import { parsePaperSummaryResponse } from "@/lib/llm/schema";
import { generateDailyReport } from "@/lib/reports/generate";
import { renderSinglePaperSummaryMarkdown } from "@/lib/reports/markdown";
import { decideBatchReadiness } from "@/lib/reports/batch";
import { paper } from "./helpers";

describe("report generation", () => {
  it("delays when the official batch is not available", () => {
    const decision = decideBatchReadiness(new Date("2026-06-13T08:00:00Z"), new Date("2026-06-13T12:00:00Z"));
    expect(decision.action).toBe("delay");
  });

  it("generates fallback report without LLM config", async () => {
    const result = await generateDailyReport({
      batchDate: "2026-06-13",
      papers: [paper()],
      now: new Date("2026-06-13T12:00:00Z"),
      preference: {
        categories: ["cs.CL"],
        includeKeywords: [],
        excludeKeywords: [],
        topN: 1
      }
    });

    expect(result.status).toBe("succeeded");
    expect(result.reason).toBe("llm_not_configured");
    expect(result.markdown).toContain("未配置 LLM");
  });

  it("validates LLM structured output and exports markdown", () => {
    const summary = parsePaperSummaryResponse({
      title_original: "Efficient Language Model Retrieval",
      title_zh: "高效语言模型检索",
      abstract_original: "We study retrieval augmented generation.",
      abstract_zh: "我们研究检索增强生成。",
      one_sentence_summary_zh: "提升科研检索效率",
      summary_zh: "本文围绕检索增强生成提出高效方法。"
    });

    expect(summary.one_sentence_summary_zh.length).toBeLessThanOrEqual(30);
    expect(renderSinglePaperSummaryMarkdown(paper(), summary)).toContain("高效语言模型检索");
  });
});
