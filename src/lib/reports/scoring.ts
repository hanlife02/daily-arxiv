import type { PaperRecord } from "@/lib/arxiv/types";

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
};

export function scorePaper(paper: PaperRecord, preference: RankingPreference, now = new Date()): ScoredPaper | null {
  if (!paper.categories.some((category) => preference.categories.includes(category))) return null;

  const haystackTitle = paper.title.toLowerCase();
  const haystackAbstract = paper.abstract.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  for (const category of paper.categories) {
    if (preference.categories.includes(category)) {
      const weight = preference.categoryWeights?.[category] ?? 1;
      score += 10 * weight;
      reasons.push(`category:${category}`);
    }
  }

  for (const keyword of preference.includeKeywords.map((item) => item.toLowerCase()).filter(Boolean)) {
    if (haystackTitle.includes(keyword)) {
      score += 12;
      reasons.push(`title:${keyword}`);
    }
    if (haystackAbstract.includes(keyword)) {
      score += 6;
      reasons.push(`abstract:${keyword}`);
    }
  }

  for (const keyword of preference.excludeKeywords.map((item) => item.toLowerCase()).filter(Boolean)) {
    if (haystackTitle.includes(keyword) || haystackAbstract.includes(keyword)) {
      return null;
    }
  }

  const ageHours = Math.max(0, (now.getTime() - paper.publishedAt.getTime()) / 36e5);
  score += Math.max(0, 8 - ageHours / 12);

  return { ...paper, score, reasons };
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
