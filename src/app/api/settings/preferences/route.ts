import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { upsertUserPreference } from "@/lib/app/settings";
import { createUserPreferenceSettingsHandler } from "@/lib/app/user-settings-route";

const post = createUserPreferenceSettingsHandler({
  requireUser: requireApiUser,
  upsertUserPreference
});

export const POST = withApiErrorHandling(post);
