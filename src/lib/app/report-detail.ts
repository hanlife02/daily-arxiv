import type { paper, paperMetric, userPreference } from "@/lib/db/schema";
import { advancedScorePaper, explainScore } from "@/lib/reports/scoring";
import type { S2PaperData } from "@/lib/arxiv/s2";
import type { PaperRecord } from "@/lib/arxiv/types";

type PaperRow = typeof paper.$inferSelect;
type PaperMetricRow = typeof paperMetric.$inferSelect;
type UserPreferenceRow = typeof userPreference.$inferSelect;

export type ReportPaperDetail = {
  arxivId: string;
  title: string;
  abstractPreview: string | null;
  primaryCategory: string | null;
  score: number | null;
  reasons: string[];
  missing: boolean;
};

export function diffReportVersionPaperIds(previous: string[], current: string[]) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const added = current.filter((id) => !previousSet.has(id));
  const removed = previous.filter((id) => !currentSet.has(id));
  const moved = current.filter((id, index) => previousSet.has(id) && previous[index] !== id);
  return {
    added,
    removed,
    moved,
    reordered: moved.length > 0 && added.length === 0 && removed.length === 0
  };
}

export type ReportPaperVersionChange = "added" | "moved" | "unchanged";

export function reportPaperVersionChange(
  diff: ReturnType<typeof diffReportVersionPaperIds>,
  paperId: string
): ReportPaperVersionChange {
  if (diff.added.includes(paperId)) return "added";
  if (diff.moved.includes(paperId)) return "moved";
  return "unchanged";
}

function metricToS2(row: PaperMetricRow | undefined): S2PaperData | undefined {
  if (!row || row.s2Status !== "ok") return undefined;
  return {
    arxivId: row.arxivId,
    avgHIndex: row.avgHIndex,
    strongAuthorCount: row.strongAuthorCount,
    peakHIndex: row.peakHIndex,
    referencesCount: row.referencesCount
  };
}

function paperRowToRecord(row: PaperRow): PaperRecord {
  return {
    arxivId: row.arxivId,
    title: row.title,
    abstract: row.abstract,
    authors: row.authors,
    categories: row.categories,
    primaryCategory: row.primaryCategory,
    arxivUrl: row.arxivUrl,
    pdfUrl: row.pdfUrl ?? undefined,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt
  };
}

function abstractPreview(abstract: string) {
  const normalized = abstract.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

export function matchesReportPaperDetailQuery(detail: ReportPaperDetail, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    detail.arxivId,
    detail.title,
    detail.abstractPreview ?? "",
    detail.primaryCategory ?? "",
    ...detail.reasons
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function buildReportPaperDetails(input: {
  paperIds: string[];
  papers: PaperRow[];
  metrics: PaperMetricRow[];
  preference: UserPreferenceRow | null | undefined;
  now?: Date;
}) {
  const paperById = new Map(input.papers.map((row) => [row.arxivId, row]));
  const metricById = new Map(input.metrics.map((row) => [row.arxivId, row]));
  const preference = input.preference;

  return input.paperIds.map((paperId): ReportPaperDetail => {
    const row = paperById.get(paperId);
    if (!row) {
      return {
        arxivId: paperId,
        title: paperId,
        abstractPreview: null,
        primaryCategory: null,
        score: null,
        reasons: ["论文元数据缺失"],
        missing: true
      };
    }

    const record = paperRowToRecord(row);
    const scored = preference
      ? advancedScorePaper(
          record,
          {
            categories: preference.categories,
            includeKeywords: preference.includeKeywords,
            excludeKeywords: preference.excludeKeywords,
            categoryWeights: preference.categoryWeights,
            topN: preference.topN
          },
          metricToS2(metricById.get(paperId)),
          input.now
        )
      : null;

    return {
      arxivId: paperId,
      title: record.title,
      abstractPreview: abstractPreview(record.abstract),
      primaryCategory: record.primaryCategory,
      score: scored?.score ?? null,
      reasons: scored ? explainScore(scored) : ["已入选日报"],
      missing: false
    };
  });
}
