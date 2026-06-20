import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { ARXIV_CATEGORIES } from "@/lib/arxiv/categories";

async function get() {
  await requireApiUser();
  return Response.json({ categories: ARXIV_CATEGORIES });
}

export const GET = withApiErrorHandling(get);
