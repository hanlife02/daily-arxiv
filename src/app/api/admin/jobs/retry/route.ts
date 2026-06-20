import { eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { enqueueBackupJob, enqueueCrawlJob, enqueueEmailJob, enqueueReportJob, enqueueRetentionJob } from "@/lib/app/jobs";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";

async function post(request: Request) {
  const user = await requireApiAdmin();
  const form = await request.formData();
  const logId = stringFromForm(form.get("logId"));
  const log = logId ? await db.query.jobLog.findFirst({ where: eq(jobLog.id, logId) }) : null;
  if (!log) return redirectToApp("/admin?error=Job%20log%20not%20found", request);

  const data = (log.metadata?.data ?? {}) as Record<string, unknown>;
  if (log.type === "arxiv-crawl") {
    await enqueueCrawlJob({ ...data, requestedBy: user.id });
  } else if (log.type === "report-generation") {
    await enqueueReportJob({ ...data, requestedBy: user.id });
  } else if (log.type === "email-notification") {
    const reportId = typeof data.reportId === "string" ? data.reportId : "";
    if (!reportId) return redirectToApp("/admin?error=reportId%20missing", request);
    await enqueueEmailJob({ reportId, requestedBy: user.id });
  } else if (log.type === "backup") {
    await enqueueBackupJob({ requestedBy: user.id });
  } else if (log.type === "data-retention") {
    await enqueueRetentionJob({ requestedBy: user.id });
  } else {
    return redirectToApp("/admin?error=Unsupported%20job%20type", request);
  }

  return redirectToApp("/admin?job=retry", request);
}

export const POST = withApiErrorHandling(post);
