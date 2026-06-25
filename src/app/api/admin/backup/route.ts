import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { enqueueBackupJob } from "@/lib/app/jobs";
import { redirectToApp } from "@/lib/app/http";

async function post(request: Request) {
  const user = await requireApiAdmin();
  try {
    const job = await enqueueBackupJob({ requestedBy: user.id });
    return redirectToApp(`/admin?job=${encodeURIComponent(job.jobId)}`, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue backup job";
    return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
