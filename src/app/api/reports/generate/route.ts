import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { createUserReportGenerationHandler } from "@/lib/app/report-generation-route";
import { enqueueReportJob } from "@/lib/app/jobs";

const post = createUserReportGenerationHandler({
  requireUser: requireApiUser,
  enqueueReportJob
});

export const POST = withApiErrorHandling(post);
