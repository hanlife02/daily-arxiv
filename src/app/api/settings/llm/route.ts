import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { upsertUserLlmConfig } from "@/lib/app/settings";
import { createUserLlmConfigHandler } from "@/lib/app/user-settings-route";

const post = createUserLlmConfigHandler({
  requireUser: requireApiUser,
  upsertUserLlmConfig
});

export const POST = withApiErrorHandling(post);
