import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper, userPaperState, userPreference } from "@/lib/db/schema";
import { requireUser } from "@/lib/app/authz";
import { advancedRankPapers } from "@/lib/reports/scoring";
import { fetchS2Batch } from "@/lib/arxiv/s2";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { PaperReader } from "@/components/read/paper-reader";

export const dynamic = "force-dynamic";

export default async function ReadPage() {
  const user = await requireUser();

  const preference = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, user.id)
  });

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 3);

  const rows = await db
    .select()
    .from(paper)
    .where(gte(paper.publishedAt, since))
    .orderBy(desc(paper.publishedAt))
    .limit(200);

  const paperRecords = rows.map((r) => ({
    arxivId: r.arxivId,
    title: r.title,
    abstract: r.abstract,
    authors: r.authors,
    categories: r.categories,
    primaryCategory: r.primaryCategory,
    arxivUrl: r.arxivUrl,
    pdfUrl: r.pdfUrl ?? undefined,
    publishedAt: r.publishedAt,
    updatedAt: r.updatedAt
  }));

  // Pre-filter by user categories
  const matched = preference && preference.categories.length > 0
    ? paperRecords.filter((r) => r.categories.some((c) => preference.categories.includes(c)))
    : [];

  // Fetch S2 data for matched papers (1 batch request)
  const s2Data = matched.length > 0
    ? await fetchS2Batch(matched.map((p) => p.arxivId))
    : new Map();

  const scoredPapers = advancedRankPapers(
    matched,
    {
      categories: preference?.categories ?? [],
      includeKeywords: preference?.includeKeywords ?? [],
      excludeKeywords: preference?.excludeKeywords ?? [],
      categoryWeights: preference?.categoryWeights,
      topN: 50
    },
    s2Data
  );

  const states = await db.query.userPaperState.findMany({
    where: eq(userPaperState.userId, user.id)
  });
  const stateMap = Object.fromEntries(states.map((s) => [s.paperId, { favorited: s.favorited, read: s.read }]));

  const llmConfig = await getDecryptedLlmConfig(user.id);

  return (
    <PaperReader
      papers={scoredPapers}
      paperStates={stateMap}
      llmConfigured={!!llmConfig}
      totalPaperCount={paperRecords.length}
      hasCategories={!!(preference && preference.categories.length > 0)}
    />
  );
}
