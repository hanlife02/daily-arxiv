import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { enqueueRetentionJob } from "@/lib/app/jobs";
import { redirectToApp } from "@/lib/app/http";

async function post(request: Request) {
  const user = await requireApiAdmin();
  try {
    const job = await enqueueRetentionJob({ requestedBy: user.id });
    return redirectToApp(`/admin?job=${encodeURIComponent(job.jobId)}`, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue retention job";
    return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
