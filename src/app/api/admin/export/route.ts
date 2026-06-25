import { desc, eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { buildAdminPortableExport, jsonExportResponse } from "@/lib/app/exports";
import { getAdminSettings } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, allowedEmailDomain, user } from "@/lib/db/schema";

async function get() {
  const currentAdmin = await requireApiAdmin();
  const [settings, notificationSmtp, domains, users] = await Promise.all([
    getAdminSettings(),
    db.query.adminNotificationSmtpConfig.findFirst({ where: eq(adminNotificationSmtpConfig.id, "system") }),
    db.query.allowedEmailDomain.findMany({ orderBy: allowedEmailDomain.domain }),
    db.query.user.findMany({ orderBy: desc(user.createdAt) })
  ]);
  const exportedAt = new Date();

  return jsonExportResponse(
    buildAdminPortableExport({
      admin: currentAdmin,
      settings,
      notificationSmtp,
      allowedEmailDomains: domains,
      users
    }, exportedAt),
    `daily-arxiv-admin-export-${exportedAt.toISOString().slice(0, 10)}.json`
  );
}

export const GET = withApiErrorHandling(get);
