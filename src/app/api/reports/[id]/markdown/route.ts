import { and, eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { userReportWhere } from "@/lib/app/report-access";
import { createReportMarkdownDownloadHandler } from "@/lib/app/report-markdown-download";
import { db } from "@/lib/db";
import { reportVersion } from "@/lib/db/schema";

const get = createReportMarkdownDownloadHandler({
  requireUser: requireApiUser,
  findReport: (reportId, userId) => db.query.report.findFirst({
    where: userReportWhere(reportId, userId)
  }),
  findVersion: (reportId, version) => db.query.reportVersion.findFirst({
    where: and(eq(reportVersion.reportId, reportId), eq(reportVersion.version, version))
  })
});

export const GET = withApiErrorHandling(get);
