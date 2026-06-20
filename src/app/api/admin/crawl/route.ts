import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { redirectToApp } from "@/lib/app/http";
import { enqueueCrawlJob } from "@/lib/app/jobs";
import { getAdminSettings } from "@/lib/app/settings";

async function post(request: Request) {
  const user = await requireApiAdmin();
  try {
    const settings = await getAdminSettings();
    const job = await enqueueCrawlJob({
      maxResultsPerCategory: settings.arxivMaxResultsPerCategory,
      requestedBy: user.id
    });
    return redirectToApp(`/admin?job=${encodeURIComponent(job.jobId)}`, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue crawl job";
    return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
