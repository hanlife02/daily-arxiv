import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { allowedEmailDomain } from "@/lib/db/schema";
import { resolveAllowedRegistrationDomains } from "@/lib/users/registration";

export async function getAllowedRegistrationDomains() {
  const [enabledRows, configuredRows] = await Promise.all([
    db
      .select({ domain: allowedEmailDomain.domain })
      .from(allowedEmailDomain)
      .where(eq(allowedEmailDomain.enabled, true)),
    db.select({ domain: allowedEmailDomain.domain }).from(allowedEmailDomain).limit(1)
  ]);

  return resolveAllowedRegistrationDomains({
    enabledDomains: enabledRows.map((row) => row.domain),
    hasConfiguredDomains: configuredRows.length > 0,
    adminEmail: process.env.ADMIN_EMAIL
  });
}
