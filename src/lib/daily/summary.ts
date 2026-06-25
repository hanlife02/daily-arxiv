import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchArxivCategory, parseArxivFeed } from "@/lib/arxiv/client";
import type { PaperRecord } from "@/lib/arxiv/types";
import type { LlmConfig } from "@/lib/llm/chat-completions";
import { paperSummarySchema, type PaperSummary } from "@/lib/llm/schema";
import { generateDailyReport } from "@/lib/reports/generate";

const DEFAULT_CATEGORY = "cs.CL";
const MOCK_LLM_CONFIG: LlmConfig = {
  baseUrl: "mock://daily-summary",
  apiKey: "mock",
  model: "mock-deterministic"
};

export type DailySummaryCliOptions = {
  readonly categories: readonly string[];
  readonly limit: number;
  readonly batchDate: string;
  readonly fixturePath?: string;
  readonly mockLlm: boolean;
  readonly outputPath?: string;
};

export class DailySummaryCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailySummaryCliError";
  }
}

export function parseDailySummaryArgs(argv: readonly string[]): DailySummaryCliOptions {
  const categories: string[] = [];
  let limit = 5;
  let batchDate = new Date().toISOString().slice(0, 10);
  let fixturePath: string | undefined;
  let mockLlm = false;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--mock-llm") {
      mockLlm = true;
      continue;
    }
    if (arg === "--category") {
      categories.push(...parseCategoryList(readOptionValue(argv, index, arg)));
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      limit = parsePositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--batch-date") {
      batchDate = parseBatchDate(readOptionValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--fixture") {
      fixturePath = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      outputPath = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new DailySummaryCliError(`Unknown argument: ${arg}`);
  }

  return {
    categories: categories.length > 0 ? uniqueStrings(categories) : [DEFAULT_CATEGORY],
    limit,
    batchDate,
    fixturePath,
    mockLlm,
    outputPath
  };
}

export async function runDailySummaryCli(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  const options = parseDailySummaryArgs(argv);
  const papers = await loadPapers(options);
  const llmConfig = options.mockLlm ? MOCK_LLM_CONFIG : parseLlmConfig(env);
  const result = await generateDailyReport({
    batchDate: options.batchDate,
    papers,
    llmConfig,
    now: new Date(`${options.batchDate}T12:00:00.000Z`),
    preference: {
      categories: [...options.categories],
      includeKeywords: [],
      excludeKeywords: [],
      topN: options.limit
    },
    summarize: options.mockLlm ? summarizePaperWithMockLlm : undefined
  });

  if (options.outputPath) {
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, result.markdown);
  }
  return result.markdown;
}

async function loadPapers(options: DailySummaryCliOptions): Promise<PaperRecord[]> {
  if (options.fixturePath) {
    return parseArxivFeed(await readFile(options.fixturePath, "utf8"));
  }

  const feeds = await Promise.all(options.categories.map((category) => fetchArxivCategory(category, options.limit)));
  return uniquePapers(feeds.flat());
}

function parseLlmConfig(env: NodeJS.ProcessEnv): LlmConfig {
  const baseUrl = env["LLM_BASE_URL"];
  const apiKey = env["LLM_API_KEY"];
  const model = env["LLM_MODEL"];
  if (!baseUrl || !apiKey || !model) {
    throw new DailySummaryCliError("Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL, or pass --mock-llm.");
  }
  return { baseUrl, apiKey, model };
}

function summarizePaperWithMockLlm(paper: PaperRecord): Promise<PaperSummary> {
  return Promise.resolve(
    paperSummarySchema.parse({
      title_original: paper.title,
      title_zh: `模拟摘要：${paper.title}`,
      abstract_original: paper.abstract,
      abstract_zh: `模拟中文摘要：${paper.abstract}`,
      one_sentence_summary_zh: "模拟总结突出论文贡献",
      summary_zh: `这是一段确定性的模拟摘要，用于人工 QA。论文 ${paper.arxivId} 的核心内容来自 arXiv 元数据，标题为「${paper.title}」。`
    })
  );
}

function readOptionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new DailySummaryCliError(`Missing value for ${option}`);
  }
  return value;
}

function parseCategoryList(value: string): string[] {
  return value
    .split(",")
    .map((category) => category.trim())
    .filter((category) => category.length > 0);
}

function parsePositiveInteger(value: string, option: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new DailySummaryCliError(`${option} must be a positive integer`);
  }
  return Number.parseInt(value, 10);
}

function parseBatchDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DailySummaryCliError("--batch-date must use YYYY-MM-DD");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new DailySummaryCliError("--batch-date must be a valid calendar date");
  }
  return value;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniquePapers(papers: readonly PaperRecord[]): PaperRecord[] {
  const seen = new Set<string>();
  return papers.filter((paper) => {
    if (seen.has(paper.arxivId)) {
      return false;
    }
    seen.add(paper.arxivId);
    return true;
  });
}
