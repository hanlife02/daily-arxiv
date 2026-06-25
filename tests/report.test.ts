import { describe, expect, it } from "vitest";
import { parsePaperSummaryResponse } from "@/lib/llm/schema";
import { generateDailyReport } from "@/lib/reports/generate";
import { renderSinglePaperSummaryMarkdown } from "@/lib/reports/markdown";
import { emailStatusLabel, jobStatusLabel, llmStatusLabel, reportReasonLabel, reportStatusLabel } from "@/lib/reports/status-labels";
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

  it("uses S2 authority data when selecting report papers", async () => {
    const result = await generateDailyReport({
      batchDate: "2026-06-18",
      papers: [
        paper({ arxivId: "2501.00001", title: "Agent Benchmark" }),
        paper({ arxivId: "2501.00002", title: "Agent Benchmark" })
      ],
      now: new Date("2026-06-18T12:00:00Z"),
      preference: {
        categories: ["cs.CL"],
        includeKeywords: ["agent"],
        excludeKeywords: [],
        topN: 1
      },
      s2Data: new Map([
        [
          "2501.00001",
          { arxivId: "2501.00001", avgHIndex: 3, strongAuthorCount: 0, peakHIndex: 6, referencesCount: 15 }
        ],
        [
          "2501.00002",
          { arxivId: "2501.00002", avgHIndex: 50, strongAuthorCount: 3, peakHIndex: 88, referencesCount: 35 }
        ]
      ])
    });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.arxivId).toBe("2501.00002");
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

  it("renders user-facing report and email status labels", () => {
    expect(reportStatusLabel("partial_succeeded")).toBe("部分生成");
    expect(reportReasonLabel("llm_not_configured")).toBe("未配置 LLM，仅生成论文列表");
    expect(emailStatusLabel("skipped_email_not_verified")).toBe("已跳过：邮箱未验证");
    expect(emailStatusLabel("skipped_no_new_papers")).toBe("无需发送：没有新论文");
    expect(emailStatusLabel("retry_2")).toBe("重试中：第 2 次");
    expect(jobStatusLabel("queued")).toBe("已排队");
    expect(llmStatusLabel("started")).toBe("执行中");
    expect(emailStatusLabel("custom_status")).toBe("custom_status");
  });
});
