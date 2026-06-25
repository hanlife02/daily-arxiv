import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { enqueueReportJob } from "@/lib/app/jobs";
import { createAdminReportGenerationHandler } from "@/lib/app/report-generation-route";

const post = createAdminReportGenerationHandler({
  requireAdmin: requireApiAdmin,
  enqueueReportJob
});

export const POST = withApiErrorHandling(post);
