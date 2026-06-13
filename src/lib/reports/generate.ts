import type { PaperRecord } from "@/lib/arxiv/types";
import type { LlmConfig } from "@/lib/llm/chat-completions";
import { PROMPT_VERSION, summarizePaperWithChatCompletions } from "@/lib/llm/chat-completions";
import type { PaperSummary } from "@/lib/llm/schema";
import { renderDailyReportMarkdown } from "@/lib/reports/markdown";
import { selectTopPapers, type RankingPreference } from "@/lib/reports/scoring";

export type GenerateReportInput = {
  batchDate: string;
  papers: PaperRecord[];
  preference: RankingPreference & { summaryFocus?: string };
  llmConfig?: LlmConfig;
  now?: Date;
  summarize?: (paper: PaperRecord, config: LlmConfig, focus?: string) => Promise<PaperSummary>;
};

export async function generateDailyReport(input: GenerateReportInput) {
  const generatedAt = input.now ?? new Date();
  const selected = selectTopPapers(input.papers, input.preference, generatedAt);

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

  const summarize = input.summarize ?? summarizePaperWithChatCompletions;
  const papersWithSummaries = [];
  for (const paper of selected) {
    const summary = await summarize(paper, input.llmConfig, input.preference.summaryFocus);
    papersWithSummaries.push({ ...paper, summary });
  }

  return {
    status: "succeeded" as const,
    reason: "summarized",
    selected: papersWithSummaries,
    markdown: renderDailyReportMarkdown({
      title: "daily-arxiv 日报",
      batchDate: input.batchDate,
      papers: papersWithSummaries,
      generatedAt,
      noLlm: false
    }),
    promptVersion: PROMPT_VERSION
  };
}
