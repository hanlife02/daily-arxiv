import type { PaperRecord } from "@/lib/arxiv/types";
import type { S2PaperData } from "@/lib/arxiv/s2";

export type RankingPreference = {
  categories: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  categoryWeights?: Record<string, number>;
  topN: number;
};

export type ScoredPaper = PaperRecord & {
  score: number;
  reasons: string[];
  scoreBreakdown: {
    category: number;
    relevance: number;
    novelty: number;
    value: number;
  };
};

const VALUE_TERMS = [
  "benchmark",
  "dataset",
  "open-source",
  "open source",
  "code",
  "reproducible",
  "large-scale",
  "large scale",
  "state-of-the-art",
  "sota",
  "efficient",
  "scalable",
  "robust",
  "safety",
  "evaluation",
  "empirical",
  "theorem",
  "proof",
  "theoretical",
  "survey"
];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function uniqueNormalized(values: string[]) {
  return [...new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function includesTerm(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function scoreNovelty(paper: PaperRecord, now: Date) {
  const ageHours = Math.max(0, (now.getTime() - paper.publishedAt.getTime()) / 36e5);
  const publishedFreshness = ageHours <= 12 ? 100 : clamp(100 - ((ageHours - 12) / (24 * 7 - 12)) * 100);

  const updateLagHours = Math.max(0, (paper.updatedAt.getTime() - paper.publishedAt.getTime()) / 36e5);
  if (updateLagHours < 6) return publishedFreshness;

  const updateAgeHours = Math.max(0, (now.getTime() - paper.updatedAt.getTime()) / 36e5);
  const updateFreshness = updateAgeHours <= 24 ? 100 : clamp(100 - ((updateAgeHours - 24) / (24 * 14 - 24)) * 100);
  return clamp(publishedFreshness * 0.8 + updateFreshness * 0.2);
}

function scoreValue(title: string, abstract: string, reasons: string[]) {
  let score = 0;
  for (const term of VALUE_TERMS) {
    if (includesTerm(title, term)) {
      score += 18;
      reasons.push(`value:title:${term}`);
    } else if (includesTerm(abstract, term)) {
      score += 8;
      reasons.push(`value:abstract:${term}`);
    }
  }
  return clamp(score);
}

export function scorePaper(paper: PaperRecord, preference: RankingPreference, now = new Date()): ScoredPaper | null {
  if (!paper.categories.some((category) => preference.categories.includes(category))) return null;

  const haystackTitle = paper.title.toLowerCase();
  const haystackAbstract = paper.abstract.toLowerCase();
  const reasons: string[] = [];
  const includeKeywords = uniqueNormalized(preference.includeKeywords);
  const excludeKeywords = uniqueNormalized(preference.excludeKeywords);

  for (const keyword of excludeKeywords) {
    if (haystackTitle.includes(keyword) || haystackAbstract.includes(keyword)) {
      return null;
    }
  }

  let categoryScore = 0;
  let matchedCategoryCount = 0;
  for (const category of paper.categories) {
    if (preference.categories.includes(category)) {
      const weight = clamp(preference.categoryWeights?.[category] ?? 1, 0.1, 3);
      categoryScore = Math.max(categoryScore, 70 + (weight - 1) * 20);
      matchedCategoryCount += 1;
      reasons.push(`category:${category}`);
    }
  }
  categoryScore = clamp(categoryScore + Math.max(0, matchedCategoryCount - 1) * 8);

  let relevanceScore = includeKeywords.length === 0 ? 60 : 0;
  for (const keyword of includeKeywords) {
    if (haystackTitle.includes(keyword)) {
      relevanceScore += 55;
      reasons.push(`title:${keyword}`);
    }
    if (haystackAbstract.includes(keyword)) {
      relevanceScore += 25;
      reasons.push(`abstract:${keyword}`);
    }
  }
  relevanceScore = clamp(relevanceScore);

  const noveltyScore = scoreNovelty(paper, now);
  const valueScore = scoreValue(haystackTitle, haystackAbstract, reasons);

  const score =
    categoryScore * 0.25 +
    relevanceScore * 0.3 +
    noveltyScore * 0.25 +
    valueScore * 0.2;

  return {
    ...paper,
    score,
    reasons,
    scoreBreakdown: {
      category: categoryScore,
      relevance: relevanceScore,
      novelty: noveltyScore,
      value: valueScore
    }
  };
}

export function rankPapers(papers: PaperRecord[], preference: RankingPreference, now = new Date()) {
  return papers
    .map((paper) => scorePaper(paper, preference, now))
    .filter((paper): paper is ScoredPaper => Boolean(paper))
    .sort((a, b) => b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function selectTopPapers(papers: PaperRecord[], preference: RankingPreference, now = new Date()) {
  return rankPapers(papers, preference, now).slice(0, Math.max(0, preference.topN));
}

// ── Advanced scoring with S2 author influence ──

export type AdvancedScoredPaper = ScoredPaper & {
  authorScore: number;
  refScore: number;
};

function scoreAuthorAuthority(s2: S2PaperData) {
  const peak = clamp((s2.peakHIndex / 80) * 100);
  const average = clamp((s2.avgHIndex / 45) * 100);
  const strongAuthors = clamp((s2.strongAuthorCount / 4) * 100);
  return peak * 0.55 + average * 0.25 + strongAuthors * 0.2;
}

function scoreReferenceMaturity(referencesCount: number) {
  if (referencesCount <= 0) return 35;
  if (referencesCount < 10) return 45 + referencesCount * 3;
  if (referencesCount < 20) return 75 + (referencesCount - 10) * 2.5;
  if (referencesCount <= 90) return 100;
  if (referencesCount <= 180) return 100 - ((referencesCount - 90) / 90) * 35;
  return 55;
}

export function advancedScorePaper(
  paper: PaperRecord,
  preference: RankingPreference,
  s2: S2PaperData | undefined,
  now = new Date()
): AdvancedScoredPaper | null {
  const base = scorePaper(paper, preference, now);
  if (!base) return null;
  if (!s2) return { ...base, authorScore: 0, refScore: 0 };

  const authorScore = scoreAuthorAuthority(s2);
  const refScore = scoreReferenceMaturity(s2.referencesCount);
  const fitScore = base.scoreBreakdown.category * 0.45 + base.scoreBreakdown.relevance * 0.55;
  const blended =
    fitScore * 0.3 +
    base.scoreBreakdown.novelty * 0.2 +
    base.scoreBreakdown.value * 0.15 +
    authorScore * 0.25 +
    refScore * 0.1;

  return { ...base, score: blended, authorScore, refScore };
}

export function advancedRankPapers(
  papers: PaperRecord[],
  preference: RankingPreference,
  s2Data: Map<string, S2PaperData>,
  now = new Date()
) {
  return papers
    .map((p) => advancedScorePaper(p, preference, s2Data.get(p.arxivId), now))
    .filter((p): p is AdvancedScoredPaper => Boolean(p))
    .sort((a, b) => b.score - a.score || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function explainScore(paper: ScoredPaper) {
  const explanations: string[] = [];
  if (paper.scoreBreakdown.novelty >= 80) explanations.push("新近发布");
  if (paper.scoreBreakdown.value >= 40) explanations.push("包含数据集/benchmark/代码等价值信号");
  if (paper.scoreBreakdown.relevance >= 80) explanations.push("高度匹配关键词");
  if (paper.scoreBreakdown.category >= 85) explanations.push("重点分类匹配");

  if ("authorScore" in paper && typeof paper.authorScore === "number" && paper.authorScore >= 70) {
    explanations.push("作者权威度高");
  }
  if ("refScore" in paper && typeof paper.refScore === "number" && paper.refScore >= 90) {
    explanations.push("引用结构成熟");
  }

  if (explanations.length > 0) return explanations;
  return ["匹配订阅方向"];
}
