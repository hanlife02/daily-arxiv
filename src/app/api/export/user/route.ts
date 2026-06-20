import { desc, eq, inArray } from "drizzle-orm";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { buildUserPortableExport, jsonExportResponse } from "@/lib/app/exports";
import { db } from "@/lib/db";
import { paper, report, reportVersion, userLlmConfig, userPaperState, userPreference, userSmtpConfig } from "@/lib/db/schema";

async function get() {
  const currentUser = await requireApiUser();
  const [preference, llmConfig, smtpConfig, reports, states] = await Promise.all([
    db.query.userPreference.findFirst({ where: eq(userPreference.userId, currentUser.id) }),
    db.query.userLlmConfig.findFirst({ where: eq(userLlmConfig.userId, currentUser.id) }),
    db.query.userSmtpConfig.findFirst({ where: eq(userSmtpConfig.userId, currentUser.id) }),
    db.query.report.findMany({ where: eq(report.userId, currentUser.id), orderBy: desc(report.createdAt) }),
    db.query.userPaperState.findMany({ where: eq(userPaperState.userId, currentUser.id), orderBy: desc(userPaperState.updatedAt) })
  ]);

  const reportIds = reports.map((item) => item.id);
  const paperIds = Array.from(new Set(states.map((state) => state.paperId)));
  const [versions, paperRows] = await Promise.all([
    reportIds.length
      ? db.query.reportVersion.findMany({
          where: inArray(reportVersion.reportId, reportIds),
          orderBy: [reportVersion.reportId, reportVersion.version]
        })
      : [],
    paperIds.length ? db.query.paper.findMany({ where: inArray(paper.arxivId, paperIds) }) : []
  ]);
  const paperById = new Map(paperRows.map((row) => [row.arxivId, row]));
  const exportedAt = new Date();

  return jsonExportResponse(
    buildUserPortableExport({
      user: currentUser,
      preference,
      llmConfig,
      smtpConfig,
      reports,
      reportVersions: versions,
      paperStates: states.map((state) => ({
        ...state,
        paper: paperById.get(state.paperId) ?? null
      }))
    }, exportedAt),
    `daily-arxiv-user-export-${exportedAt.toISOString().slice(0, 10)}.json`
  );
}

export const GET = withApiErrorHandling(get);
