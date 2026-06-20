import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { getSystemHealth } from "@/lib/app/health";

async function get() {
  await requireApiAdmin();
  return Response.json(await getSystemHealth());
}

export const GET = withApiErrorHandling(get);
