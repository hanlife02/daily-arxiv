import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { upsertUserSmtpConfig } from "@/lib/app/settings";
import { createUserSmtpConfigHandler } from "@/lib/app/user-settings-route";

const post = createUserSmtpConfigHandler({
  requireUser: requireApiUser,
  upsertUserSmtpConfig
});

export const POST = withApiErrorHandling(post);
