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
