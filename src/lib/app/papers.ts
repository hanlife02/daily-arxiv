import { desc, gte } from "drizzle-orm";
import { fetchArxivCategory } from "@/lib/arxiv/client";
import { filterNewSubmissions } from "@/lib/arxiv/filter";
import type { PaperRecord } from "@/lib/arxiv/types";
import { db } from "@/lib/db";
import { paper, userPreference } from "@/lib/db/schema";
import { getSubscriptionUnion } from "@/lib/arxiv/categories";

export function paperRowToRecord(row: typeof paper.$inferSelect): PaperRecord {
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

export async function upsertPapers(records: PaperRecord[]) {
  let insertedOrUpdated = 0;
  for (const record of records) {
    await db
      .insert(paper)
      .values({
        arxivId: record.arxivId,
        title: record.title,
        abstract: record.abstract,
        authors: record.authors,
        categories: record.categories,
        primaryCategory: record.primaryCategory,
        arxivUrl: record.arxivUrl,
        pdfUrl: record.pdfUrl,
        publishedAt: record.publishedAt,
        updatedAt: record.updatedAt,
        latestVersion: "v1"
      })
      .onConflictDoUpdate({
        target: paper.arxivId,
        set: {
          title: record.title,
          abstract: record.abstract,
          authors: record.authors,
          categories: record.categories,
          primaryCategory: record.primaryCategory,
          arxivUrl: record.arxivUrl,
          pdfUrl: record.pdfUrl,
          publishedAt: record.publishedAt,
          updatedAt: record.updatedAt
        }
      });
    insertedOrUpdated += 1;
  }
  return insertedOrUpdated;
}

export async function getSubscribedCategoryUnion() {
  const rows = await db.select({ categories: userPreference.categories }).from(userPreference);
  return getSubscriptionUnion(rows.map((row) => row.categories));
}

export async function crawlSubscribedCategories(maxResultsPerCategory = 100) {
  const categories = await getSubscribedCategoryUnion();
  const stats = [];
  for (const category of categories) {
    const fetched = await fetchArxivCategory(category, maxResultsPerCategory);
    const fresh = filterNewSubmissions(fetched);
    const saved = await upsertPapers(fresh);
    stats.push({ category, fetched: fetched.length, newSubmissions: fresh.length, saved });
  }
  return { categories, stats };
}

export async function getRecentPapersForCategories(categories: string[], since: Date, limit = 200) {
  if (categories.length === 0) return [];
  const rows = await db
    .select()
    .from(paper)
    .where(gte(paper.publishedAt, since))
    .orderBy(desc(paper.publishedAt))
    .limit(limit * 3);
  return rows
    .map(paperRowToRecord)
    .filter((record) => record.categories.some((category) => categories.includes(category)))
    .slice(0, limit);
}

export async function getLatestPapers(limit = 20) {
  const rows = await db.select().from(paper).orderBy(desc(paper.publishedAt)).limit(limit);
  return rows;
}
