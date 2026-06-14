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

// ── Advanced scoring with S2 author influence ──

export type AdvancedScoredPaper = ScoredPaper & {
  authorScore: number;
  refScore: number;
};

export function advancedScorePaper(
  paper: PaperRecord,
  preference: RankingPreference,
  s2: S2PaperData | undefined,
  now = new Date()
): AdvancedScoredPaper | null {
  const base = scorePaper(paper, preference, now);
  if (!base) return null;

  // Author influence: peakHIndex × log2(1 + strongAuthorCount)
  const peak = s2?.peakHIndex ?? 0;
  const strong = s2?.strongAuthorCount ?? 0;
  const authorScore = peak > 0 ? peak * Math.log2(1 + strong) : 0;

  // Reference count: 20-80 is optimal, bell curve
  const refs = s2?.referencesCount ?? 0;
  let refScore = 0;
  if (refs >= 20 && refs <= 80) {
    refScore = 100; // optimal range
  } else if (refs > 80) {
    refScore = Math.max(0, 100 - (refs - 80) * 2); // decay: too many = survey bloat
  } else {
    refScore = refs * 5; // too few = underdeveloped
  }

  // Blend: category(40%) + author(25%) + refs(15%) + keywords(15%) + freshness(5%)
  // Normalize base.score to 0-100 first (typical range is 0-40)
  const categoryNorm = Math.min(100, (base.score / 40) * 100);
  const freshNorm = Math.min(100, base.score > 0 ? ((base.score % 10) / 8) * 100 : 0);
  const kwNorm = base.reasons.some((r) => r.startsWith("title:") || r.startsWith("abstract:"))
    ? base.reasons.filter((r) => r.startsWith("title:")).length * 60 +
      base.reasons.filter((r) => r.startsWith("abstract:")).length * 30
    : 0;

  const blended =
    categoryNorm * 0.4 +
    authorScore * 0.25 +
    refScore * 0.15 +
    Math.min(100, kwNorm) * 0.15 +
    freshNorm * 0.05;

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
