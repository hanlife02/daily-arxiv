import { eq } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { createAdminDomainHandler } from "@/lib/app/admin-settings-route";
import { db } from "@/lib/db";
import { allowedEmailDomain } from "@/lib/db/schema";

const post = createAdminDomainHandler({
  requireAdmin: requireApiAdmin,
  setDomainEnabled: async (domainId, enabled) => {
    await db
      .update(allowedEmailDomain)
      .set({ enabled })
      .where(eq(allowedEmailDomain.id, domainId));
  },
  upsertAllowedEmailDomain: async (input) => {
    await db
      .insert(allowedEmailDomain)
      .values(input)
      .onConflictDoUpdate({
        target: allowedEmailDomain.domain,
        set: { enabled: input.enabled }
      });
  }
});

export const POST = withApiErrorHandling(post);
