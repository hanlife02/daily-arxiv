import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { createAdminSettingsHandler } from "@/lib/app/admin-settings-route";
import { deleteAdminNotificationSmtp, upsertAdminNotificationSmtp, upsertAdminSettings } from "@/lib/app/settings";

const post = createAdminSettingsHandler({
  requireAdmin: requireApiAdmin,
  upsertAdminSettings,
  upsertAdminNotificationSmtp,
  deleteAdminNotificationSmtp
});

export const POST = withApiErrorHandling(post);
