import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paperSummary, report, reportVersion, user, userPaperState, userPreference } from "@/lib/db/schema";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { generateDailyReport } from "@/lib/reports/generate";
import { getRecentPapersForCategories } from "@/lib/app/papers";
import { sendLatestReportEmail } from "@/lib/app/notifications";
import type { PaperSummary } from "@/lib/llm/schema";
import { fetchCachedS2Batch } from "@/lib/arxiv/s2";

export function defaultBatchDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function sinceForBatch(batchDate: string) {
  const since = new Date(`${batchDate}T00:00:00.000Z`);
  since.setUTCDate(since.getUTCDate() - 1);
  return since;
}

function initialEmailStatusForReport(result: { status: string; reason: string; selected: unknown[] }) {
  if (["succeeded", "partial_succeeded"].includes(result.status) && result.selected.length > 0) {
    return "pending";
  }
  return result.reason === "skipped_no_new_papers" ? "skipped_no_new_papers" : "skipped_not_applicable";
}

export async function generateAndStoreDailyReport(userId: string, batchDate = defaultBatchDate(), sendEmail = true) {
  const owner = await db.query.user.findFirst({
    where: eq(user.id, userId)
  });
  if (!owner) {
    return {
      status: "skipped" as const,
      reason: "user_not_found" as const
    };
  }
  if (owner.disabled) {
    return {
      status: "skipped" as const,
      reason: "user_disabled" as const
    };
  }

  const preference = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, userId)
  });

  if (!preference || preference.categories.length === 0) {
    return {
      status: "skipped" as const,
      reason: "preference_not_configured" as const
    };
  }

  const papers = await getRecentPapersForCategories(preference.categories, sinceForBatch(batchDate), 500);
  const s2Data = papers.length > 0 ? await fetchCachedS2Batch(papers.map((item) => item.arxivId)) : new Map();
  const llmConfig = await getDecryptedLlmConfig(userId);
  const result = await generateDailyReport({
    batchDate,
    papers,
    userId,
    preference: {
      categories: preference.categories,
      includeKeywords: preference.includeKeywords,
      excludeKeywords: preference.excludeKeywords,
      categoryWeights: preference.categoryWeights,
      topN: preference.topN,
      summaryFocus: preference.summaryFocus ?? undefined
    },
    s2Data,
    llmConfig
  });

  const now = new Date();
  const initialEmailStatus = initialEmailStatusForReport(result);
  const existing = await db.query.report.findFirst({
    where: and(eq(report.userId, userId), eq(report.batchDate, batchDate))
  });
  const reportId = existing?.id ?? randomUUID();
  const nextVersion = (existing?.latestVersion ?? 0) + 1;

  if (existing) {
    await db
      .update(report)
      .set({
        status: result.status,
        reason: result.reason,
        emailStatus: initialEmailStatus,
        latestVersion: nextVersion,
        updatedAt: now
      })
      .where(eq(report.id, reportId));
  } else {
    await db.insert(report).values({
      id: reportId,
      userId,
      batchDate,
      status: result.status,
      reason: result.reason,
      emailStatus: initialEmailStatus,
      latestVersion: nextVersion,
      createdAt: now,
      updatedAt: now
    });
  }

  await db.insert(reportVersion).values({
    id: randomUUID(),
    reportId,
    version: nextVersion,
    selectedPaperIds: result.selected.map((selected) => selected.arxivId),
    markdown: result.markdown,
    model: llmConfig?.model ?? null,
    promptVersion: result.promptVersion,
    createdAt: now
  });

  for (const selected of result.selected) {
    await db
      .insert(userPaperState)
      .values({
        userId,
        paperId: selected.arxivId,
        favorited: false,
        read: false,
        ignored: false,
        recommendedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [userPaperState.userId, userPaperState.paperId],
        set: {
          recommendedAt: now,
          updatedAt: now
        }
      });
  }

  for (const selected of result.selected) {
    if (!("summary" in selected) || !selected.summary || !llmConfig) continue;
    const summary = selected.summary as PaperSummary;
    await db.insert(paperSummary).values({
      id: randomUUID(),
      userId,
      paperId: selected.arxivId,
      titleOriginal: summary.title_original,
      titleZh: summary.title_zh,
      abstractOriginal: summary.abstract_original,
      abstractZh: summary.abstract_zh,
      oneSentenceSummaryZh: summary.one_sentence_summary_zh,
      summaryZh: summary.summary_zh,
      model: llmConfig.model,
      promptVersion: result.promptVersion,
      rawResponse: summary,
      createdAt: now
    });
  }

  const email = initialEmailStatus === "pending" && sendEmail
    ? await sendLatestReportEmail(reportId)
    : { sent: false, reason: initialEmailStatus === "pending" ? "not_attempted" as const : initialEmailStatus };

  return {
    status: result.status,
    reason: result.reason,
    reportId,
    version: nextVersion,
    selectedCount: result.selected.length,
    email
  };
}

export async function generateReportsForAllUsers(batchDate = defaultBatchDate(), sendEmail = true) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.disabled, false));
  const results = [];
  for (const row of rows) {
    results.push({ userId: row.id, result: await generateAndStoreDailyReport(row.id, batchDate, sendEmail) });
  }
  return results;
}

export async function getLatestReportsForUser(userId: string, limit = 20) {
  return db.query.report.findMany({
    where: eq(report.userId, userId),
    orderBy: desc(report.createdAt),
    limit
  });
}
