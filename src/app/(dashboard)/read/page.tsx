import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper, userPaperState, userPreference } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/app/authz";
import { advancedRankPapers } from "@/lib/reports/scoring";
import { fetchCachedS2Batch } from "@/lib/arxiv/s2";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { PaperReader } from "@/components/read/paper-reader";
import { getRecentPapersForCategories, paperRowToRecord } from "@/lib/app/papers";
import { paperHasAnyCategory } from "@/lib/app/paper-categories";

export const dynamic = "force-dynamic";

type ReadPageProps = {
  searchParams?: Promise<{ paper?: string }>;
};

export default async function ReadPage({ searchParams }: ReadPageProps) {
  const user = await requireAppUser();
  const params = await searchParams;
  const selectedPaperId = params?.paper?.trim() || null;

  const preference = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, user.id)
  });

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 3);

  const matched = preference?.categories.length
    ? await getRecentPapersForCategories(preference.categories, since, 200)
    : [];

  if (selectedPaperId && preference?.categories.length && !matched.some((item) => item.arxivId === selectedPaperId)) {
    const selected = await db.query.paper.findFirst({ where: eq(paper.arxivId, selectedPaperId) });
    if (selected && paperHasAnyCategory(selected.categories, preference.categories)) {
      matched.unshift(paperRowToRecord(selected));
    }
  }

  const [s2Data, states, llmConfig] = await Promise.all([
    matched.length > 0 ? fetchCachedS2Batch(matched.map((p) => p.arxivId)) : Promise.resolve(new Map()),
    db.query.userPaperState.findMany({
      where: eq(userPaperState.userId, user.id)
    }),
    getDecryptedLlmConfig(user.id)
  ]);

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

  const stateMap = Object.fromEntries(states.map((s) => [s.paperId, { favorited: s.favorited, read: s.read, ignored: s.ignored }]));

  return (
    <PaperReader
      papers={scoredPapers}
      paperStates={stateMap}
      llmConfigured={!!llmConfig}
      totalPaperCount={matched.length}
      hasCategories={!!(preference && preference.categories.length > 0)}
      initialPaperId={selectedPaperId}
    />
  );
}
