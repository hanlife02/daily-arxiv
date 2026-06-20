import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { paperMetric } from "@/lib/db/schema";

const S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch";
const S2_FIELDS = "authors.hIndex,referencesCount";

export type S2PaperData = {
  arxivId: string;
  avgHIndex: number;
  strongAuthorCount: number;
  peakHIndex: number;
  referencesCount: number;
};

export async function fetchS2Batch(arxivIds: string[]): Promise<Map<string, S2PaperData>> {
  const result = new Map<string, S2PaperData>();

  // S2 batch limit is 500, chunk if needed
  for (let i = 0; i < arxivIds.length; i += 500) {
    const chunk = arxivIds.slice(i, i + 500);
    const ids = chunk.map((id) => `ArXiv:${id}`);

    try {
      const res = await fetch(`${S2_BATCH_URL}?fields=${S2_FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });

      if (!res.ok) continue;

      const data = (await res.json()) as Array<{
        authors?: Array<{ hIndex?: number }>;
        referencesCount?: number;
      } | null>;

      for (let j = 0; j < data.length; j++) {
        const paper = data[j];
        if (!paper?.authors) continue;

        const hIndices = paper.authors.map((a) => a.hIndex ?? 0).filter((h) => h > 0);
        const avgHIndex = hIndices.length > 0 ? hIndices.reduce((a, b) => a + b, 0) / hIndices.length : 0;
        const strongAuthorCount = hIndices.filter((h) => h >= 20).length;
        const peakHIndex = hIndices.length > 0 ? Math.max(...hIndices) : 0;

        result.set(chunk[j], {
          arxivId: chunk[j],
          avgHIndex,
          strongAuthorCount,
          peakHIndex,
          referencesCount: paper.referencesCount ?? 0
        });
      }
    } catch {
      // S2 request failed, skip this chunk
    }
  }

  return result;
}

export async function fetchCachedS2Batch(arxivIds: string[], maxAgeDays = 7): Promise<Map<string, S2PaperData>> {
  const uniqueIds = [...new Set(arxivIds)].filter(Boolean);
  const result = new Map<string, S2PaperData>();
  if (uniqueIds.length === 0) return result;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);

  const rows = await db.query.paperMetric.findMany({
    where: inArray(paperMetric.arxivId, uniqueIds)
  });
  const freshIds = new Set<string>();
  for (const row of rows) {
    if (row.fetchedAt.getTime() < cutoff.getTime()) continue;
    freshIds.add(row.arxivId);
    result.set(row.arxivId, {
      arxivId: row.arxivId,
      avgHIndex: row.avgHIndex,
      strongAuthorCount: row.strongAuthorCount,
      peakHIndex: row.peakHIndex,
      referencesCount: row.referencesCount
    });
  }

  const staleOrMissingIds = uniqueIds.filter((id) => !freshIds.has(id));
  if (staleOrMissingIds.length === 0) return result;

  const fetched = await fetchS2Batch(staleOrMissingIds);
  for (const item of fetched.values()) {
    await db
      .insert(paperMetric)
      .values({
        arxivId: item.arxivId,
        avgHIndex: item.avgHIndex,
        strongAuthorCount: item.strongAuthorCount,
        peakHIndex: item.peakHIndex,
        referencesCount: item.referencesCount,
        s2Status: "ok",
        error: null,
        fetchedAt: new Date()
      })
      .onConflictDoUpdate({
        target: paperMetric.arxivId,
        set: {
          avgHIndex: item.avgHIndex,
          strongAuthorCount: item.strongAuthorCount,
          peakHIndex: item.peakHIndex,
          referencesCount: item.referencesCount,
          s2Status: "ok",
          error: null,
          fetchedAt: new Date()
        }
      });
    result.set(item.arxivId, item);
  }

  // Keep stale cached values as a fallback if a refresh misses or S2 is unavailable.
  for (const row of rows) {
    if (result.has(row.arxivId)) continue;
    result.set(row.arxivId, {
      arxivId: row.arxivId,
      avgHIndex: row.avgHIndex,
      strongAuthorCount: row.strongAuthorCount,
      peakHIndex: row.peakHIndex,
      referencesCount: row.referencesCount
    });
  }

  for (const id of staleOrMissingIds) {
    if (result.has(id)) continue;
    await db
      .insert(paperMetric)
      .values({
        arxivId: id,
        s2Status: "missing",
        error: "S2 data unavailable",
        fetchedAt: new Date()
      })
      .onConflictDoUpdate({
        target: paperMetric.arxivId,
        set: {
          s2Status: "missing",
          error: "S2 data unavailable",
          fetchedAt: new Date()
        }
      })
      .catch(() => undefined);
  }

  return result;
}
