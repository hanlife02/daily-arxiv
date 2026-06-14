import { and, eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/app/authz";
import { db } from "@/lib/db";
import { report, reportVersion } from "@/lib/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  const { id } = await params;
  const currentReport = await db.query.report.findFirst({
    where: and(eq(report.id, id), eq(report.userId, user.id))
  });
  if (!currentReport) return new Response("Not found", { status: 404 });

  const version = await db.query.reportVersion.findFirst({
    where: and(eq(reportVersion.reportId, currentReport.id), eq(reportVersion.version, currentReport.latestVersion))
  });
  if (!version) return new Response("Not found", { status: 404 });

  return new Response(version.markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="daily-arxiv-${currentReport.batchDate}.md"`
    }
  });
}
