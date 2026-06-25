import { and, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailLog, jobLog, llmCallLog, paper } from "@/lib/db/schema";
import { getAdminSettings } from "@/lib/app/settings";

function cutoffDate(days: number, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, Math.floor(days)));
  return cutoff;
}

export async function applyDataRetention(now = new Date()) {
  const settings = await getAdminSettings();
  const logCutoff = cutoffDate(settings.logRetentionDays, now);
  const pdfCutoff = cutoffDate(settings.pdfTextRetentionDays, now);

  const deletedJobLogs = await db
    .delete(jobLog)
    .where(lt(jobLog.createdAt, logCutoff))
    .returning({ id: jobLog.id });

  const deletedEmailLogs = await db
    .delete(emailLog)
    .where(lt(emailLog.createdAt, logCutoff))
    .returning({ id: emailLog.id });

  const deletedLlmCallLogs = await db
    .delete(llmCallLog)
    .where(lt(llmCallLog.createdAt, logCutoff))
    .returning({ id: llmCallLog.id });

  const clearedPdfText = await db
    .update(paper)
    .set({ pdfText: null })
    .where(and(isNotNull(paper.pdfText), lt(paper.updatedAt, pdfCutoff)))
    .returning({ arxivId: paper.arxivId });

  return {
    deletedJobLogs: deletedJobLogs.length,
    deletedEmailLogs: deletedEmailLogs.length,
    deletedLlmCallLogs: deletedLlmCallLogs.length,
    clearedPdfText: clearedPdfText.length,
    logCutoff: logCutoff.toISOString(),
    pdfCutoff: pdfCutoff.toISOString()
  };
}
