import type { PaperRecord } from "@/lib/arxiv/types";
import type { PaperSummary } from "@/lib/llm/schema";
import { explainScore, type ScoredPaper } from "@/lib/reports/scoring";

export type ReportMarkdownInput = {
  title: string;
  batchDate: string;
  papers: Array<PaperRecord & Partial<ScoredPaper> & { summary?: PaperSummary }>;
  generatedAt: Date;
  noLlm: boolean;
  summaryFailures?: Array<{ arxivId: string; error: string }>;
};

export function renderSinglePaperSummaryMarkdown(paper: PaperRecord, summary: PaperSummary) {
  return [
    `# ${summary.title_zh}`,
    "",
    `英文标题：${summary.title_original}`,
    "",
    `arXiv：${paper.arxivUrl}`,
    "",
    `一句话：${summary.one_sentence_summary_zh}`,
    "",
    "## 中文摘要",
    "",
    summary.abstract_zh,
    "",
    "## 精简总结",
    "",
    summary.summary_zh
  ].join("\n");
}

export function renderDailyReportMarkdown(input: ReportMarkdownInput) {
  const lines = [
    `# ${input.title}`,
    "",
    `批次：${input.batchDate}`,
    `生成时间：${input.generatedAt.toISOString()}`,
    input.noLlm ? "状态：未配置 LLM，仅生成论文列表。" : "状态：已生成摘要。",
    ""
  ];

  input.papers.forEach((paper, index) => {
    lines.push(`## ${index + 1}. ${paper.summary?.title_zh ?? paper.title}`);
    lines.push("");
    lines.push(`- arXiv ID：${paper.arxivId}`);
    lines.push(`- 原标题：${paper.title}`);
    lines.push(`- 分类：${paper.categories.join(", ")}`);
    lines.push(`- 链接：${paper.arxivUrl}`);
    if (typeof paper.score === "number" && paper.scoreBreakdown && paper.reasons) {
      lines.push(`- 推荐分：${paper.score.toFixed(1)}`);
      lines.push(`- 入选原因：${explainScore(paper as ScoredPaper).join("；")}`);
    }
    if (paper.summary) {
      lines.push(`- 一句话：${paper.summary.one_sentence_summary_zh}`);
      lines.push("");
      lines.push(paper.summary.summary_zh);
    }
    lines.push("");
  });

  if (input.summaryFailures && input.summaryFailures.length > 0) {
    lines.push("## 摘要失败");
    lines.push("");
    for (const failure of input.summaryFailures) {
      lines.push(`- ${failure.arxivId}：${failure.error}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
