import { and, isNotNull, lt, sql } from "drizzle-orm";
import { getAdminSettings } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { emailLog, jobLog, llmCallLog, paper, paperMetric } from "@/lib/db/schema";

export type DataLifecycleMetric = {
  key: string;
  label: string;
  count: number;
  sizeBytes: number;
  cleanupBoundary?: string;
  cleanupCandidateCount?: number;
  cleanupDescription?: string;
};

function cutoffDate(days: number, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, Math.floor(days)));
  return cutoff;
}

async function countRows<T>(query: Promise<T[]>, getCount: (row: T | undefined) => unknown) {
  const [row] = await query;
  return Number(getCount(row) ?? 0);
}

export async function getDataLifecycleSummary(now = new Date()): Promise<DataLifecycleMetric[]> {
  const settings = await getAdminSettings();
  const logCutoff = cutoffDate(settings.logRetentionDays, now);
  const pdfCutoff = cutoffDate(settings.pdfTextRetentionDays, now);

  const [
    jobStats,
    emailStats,
    llmStats,
    metricStats,
    pdfStats,
    jobCleanupCount,
    emailCleanupCount,
    llmCleanupCount,
    pdfCleanupCount
  ] = await Promise.all([
    db.select({
      count: sql<number>`count(*)::int`,
      sizeBytes: sql<number>`coalesce(sum(pg_column_size(${jobLog.id}) + pg_column_size(${jobLog.type}) + pg_column_size(${jobLog.status}) + coalesce(pg_column_size(${jobLog.message}), 0) + pg_column_size(${jobLog.metadata}) + pg_column_size(${jobLog.createdAt})), 0)::int`
    }).from(jobLog),
    db.select({
      count: sql<number>`count(*)::int`,
      sizeBytes: sql<number>`coalesce(sum(pg_column_size(${emailLog.id}) + coalesce(pg_column_size(${emailLog.userId}), 0) + pg_column_size(${emailLog.recipient}) + pg_column_size(${emailLog.subject}) + pg_column_size(${emailLog.provider}) + pg_column_size(${emailLog.status}) + coalesce(pg_column_size(${emailLog.error}), 0) + pg_column_size(${emailLog.createdAt})), 0)::int`
    }).from(emailLog),
    db.select({
      count: sql<number>`count(*)::int`,
      sizeBytes: sql<number>`coalesce(sum(pg_column_size(${llmCallLog.id}) + coalesce(pg_column_size(${llmCallLog.userId}), 0) + coalesce(pg_column_size(${llmCallLog.paperId}), 0) + coalesce(pg_column_size(${llmCallLog.reportId}), 0) + pg_column_size(${llmCallLog.endpoint}) + pg_column_size(${llmCallLog.model}) + pg_column_size(${llmCallLog.status}) + coalesce(pg_column_size(${llmCallLog.error}), 0) + pg_column_size(${llmCallLog.promptChars}) + pg_column_size(${llmCallLog.completionChars}) + coalesce(pg_column_size(${llmCallLog.promptTokens}), 0) + coalesce(pg_column_size(${llmCallLog.completionTokens}), 0) + coalesce(pg_column_size(${llmCallLog.totalTokens}), 0) + pg_column_size(${llmCallLog.usedPdfText}) + pg_column_size(${llmCallLog.startedAt}) + coalesce(pg_column_size(${llmCallLog.finishedAt}), 0) + pg_column_size(${llmCallLog.createdAt})), 0)::int`
    }).from(llmCallLog),
    db.select({
      count: sql<number>`count(*)::int`,
      sizeBytes: sql<number>`coalesce(sum(pg_column_size(${paperMetric.arxivId}) + pg_column_size(${paperMetric.avgHIndex}) + pg_column_size(${paperMetric.strongAuthorCount}) + pg_column_size(${paperMetric.peakHIndex}) + pg_column_size(${paperMetric.referencesCount}) + pg_column_size(${paperMetric.s2Status}) + coalesce(pg_column_size(${paperMetric.error}), 0) + pg_column_size(${paperMetric.fetchedAt})), 0)::int`
    }).from(paperMetric),
    db.select({
      count: sql<number>`count(*)::int`,
      sizeBytes: sql<number>`coalesce(sum(octet_length(${paper.pdfText})), 0)::int`
    }).from(paper).where(isNotNull(paper.pdfText)),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(jobLog).where(lt(jobLog.createdAt, logCutoff)), (row) => row?.count),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(emailLog).where(lt(emailLog.createdAt, logCutoff)), (row) => row?.count),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(llmCallLog).where(lt(llmCallLog.createdAt, logCutoff)), (row) => row?.count),
    countRows(
      db.select({ count: sql<number>`count(*)::int` }).from(paper).where(and(isNotNull(paper.pdfText), lt(paper.updatedAt, pdfCutoff))),
      (row) => row?.count
    )
  ]);

  return [
    {
      key: "job_log",
      label: "任务日志",
      count: Number(jobStats[0]?.count ?? 0),
      sizeBytes: Number(jobStats[0]?.sizeBytes ?? 0),
      cleanupBoundary: logCutoff.toISOString(),
      cleanupCandidateCount: jobCleanupCount,
      cleanupDescription: `createdAt < ${logCutoff.toISOString()}`
    },
    {
      key: "email_log",
      label: "邮件日志",
      count: Number(emailStats[0]?.count ?? 0),
      sizeBytes: Number(emailStats[0]?.sizeBytes ?? 0),
      cleanupBoundary: logCutoff.toISOString(),
      cleanupCandidateCount: emailCleanupCount,
      cleanupDescription: `createdAt < ${logCutoff.toISOString()}`
    },
    {
      key: "llm_call_log",
      label: "LLM 调用日志",
      count: Number(llmStats[0]?.count ?? 0),
      sizeBytes: Number(llmStats[0]?.sizeBytes ?? 0),
      cleanupBoundary: logCutoff.toISOString(),
      cleanupCandidateCount: llmCleanupCount,
      cleanupDescription: `createdAt < ${logCutoff.toISOString()}`
    },
    {
      key: "paper_metric",
      label: "S2 指标缓存",
      count: Number(metricStats[0]?.count ?? 0),
      sizeBytes: Number(metricStats[0]?.sizeBytes ?? 0)
    },
    {
      key: "paper_pdf_text",
      label: "PDF 文本缓存",
      count: Number(pdfStats[0]?.count ?? 0),
      sizeBytes: Number(pdfStats[0]?.sizeBytes ?? 0),
      cleanupBoundary: pdfCutoff.toISOString(),
      cleanupCandidateCount: pdfCleanupCount,
      cleanupDescription: `paper.updatedAt < ${pdfCutoff.toISOString()}`
    }
  ];
}
