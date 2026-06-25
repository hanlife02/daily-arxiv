import type { PaperRecord } from "@/lib/arxiv/types";
import type { S2PaperData } from "@/lib/arxiv/s2";
import type { LlmConfig, PaperSummaryResult } from "@/lib/llm/chat-completions";
import { buildPaperSummaryPrompt, PROMPT_VERSION, summarizePaperWithChatCompletionsResult } from "@/lib/llm/chat-completions";
import type { PaperSummary } from "@/lib/llm/schema";
import type { LlmUsageTokens } from "@/lib/llm/usage-tokens";
import { renderDailyReportMarkdown } from "@/lib/reports/markdown";
import { advancedRankPapers, selectTopPapers, type RankingPreference } from "@/lib/reports/scoring";

export type GenerateReportInput = {
  batchDate: string;
  papers: PaperRecord[];
  preference: RankingPreference & { summaryFocus?: string };
  userId?: string;
  llmConfig?: LlmConfig;
  s2Data?: Map<string, S2PaperData>;
  now?: Date;
  summarize?: (paper: PaperRecord, config: LlmConfig, focus?: string) => Promise<PaperSummary | PaperSummaryResult>;
};

function normalizeSummaryResult(result: PaperSummary | PaperSummaryResult): { summary: PaperSummary; usage?: LlmUsageTokens } {
  return "summary" in result ? result : { summary: result };
}

export async function generateDailyReport(input: GenerateReportInput) {
  const generatedAt = input.now ?? new Date();
  const selected = input.s2Data
    ? advancedRankPapers(input.papers, input.preference, input.s2Data, generatedAt).slice(
        0,
        Math.max(0, input.preference.topN)
      )
    : selectTopPapers(input.papers, input.preference, generatedAt);

  if (selected.length === 0) {
    return {
      status: "skipped" as const,
      reason: "skipped_no_new_papers",
      selected,
      markdown: "",
      promptVersion: PROMPT_VERSION
    };
  }

  if (!input.llmConfig) {
    return {
      status: "succeeded" as const,
      reason: "llm_not_configured",
      selected,
      markdown: renderDailyReportMarkdown({
        title: "daily-arxiv 日报",
        batchDate: input.batchDate,
        papers: selected,
        generatedAt,
        noLlm: true
      }),
      promptVersion: PROMPT_VERSION
    };
  }

  const summarize = input.summarize ?? summarizePaperWithChatCompletionsResult;
  const papersWithSummaries = [];
  const summaryFailures: Array<{ arxivId: string; error: string }> = [];
  const llmUsage = input.userId ? await import("@/lib/app/llm-usage") : null;
  for (const paper of selected) {
    const prompt = buildPaperSummaryPrompt(paper, input.preference.summaryFocus);
    const call = input.userId && llmUsage
      ? await llmUsage.startLlmCall({
          userId: input.userId,
          paperId: paper.arxivId,
          endpoint: "report-summary",
          model: input.llmConfig.model,
          promptChars: prompt.length
        })
      : null;
    try {
      const result = normalizeSummaryResult(await summarize(paper, input.llmConfig, input.preference.summaryFocus));
      const summary = result.summary;
      if (call) {
        await llmUsage?.finishLlmCall(call.id, {
          status: "succeeded",
          completionChars: JSON.stringify(summary).length,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          totalTokens: result.usage?.totalTokens
        });
      }
      papersWithSummaries.push({ ...paper, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summary failed";
      if (call) {
        await llmUsage?.finishLlmCall(call.id, {
          status: "failed",
          error: message
        });
      }
      summaryFailures.push({ arxivId: paper.arxivId, error: message });
      papersWithSummaries.push(paper);
    }
  }
  const status = summaryFailures.length > 0 ? "partial_succeeded" as const : "succeeded" as const;

  return {
    status,
    reason: summaryFailures.length > 0 ? "summarized_with_failures" as const : "summarized" as const,
    selected: papersWithSummaries,
    markdown: renderDailyReportMarkdown({
      title: "daily-arxiv 日报",
      batchDate: input.batchDate,
      papers: papersWithSummaries,
      generatedAt,
      noLlm: false,
      summaryFailures
    }),
    promptVersion: PROMPT_VERSION
  };
}
