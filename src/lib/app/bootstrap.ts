import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, adminSetting, allowedEmailDomain, user } from "@/lib/db/schema";
import { getEmailDomain } from "@/lib/users/registration";

const SYSTEM_SETTINGS_ID = "system";

export async function ensureDefaultAdminSettings() {
  await db
    .insert(adminSetting)
    .values({
      id: SYSTEM_SETTINGS_ID
    })
    .onConflictDoNothing();
}

export async function ensureAdminEmailDomain(email: string) {
  const domain = getEmailDomain(email);
  await db
    .insert(allowedEmailDomain)
    .values({
      id: randomUUID(),
      domain,
      enabled: true
    })
    .onConflictDoNothing();
}

export async function ensureAdminUserFromEnv() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!email || !password) return { created: false, reason: "admin_env_missing" as const };

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email)
  });

  await ensureAdminEmailDomain(email);

  if (existing) {
    if (existing.role !== "admin" || !existing.emailVerified) {
      await db
        .update(user)
        .set({
          role: "admin",
          emailVerified: true,
          updatedAt: new Date()
        })
        .where(eq(user.id, existing.id));
    }
    return { created: false, reason: "admin_exists" as const };
  }

  const userId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(password);

  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: "admin",
    createdAt: now,
    updatedAt: now
  });

  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now
  });

  return { created: true, reason: "admin_created" as const };
}

export async function bootstrapApplication() {
  await ensureDefaultAdminSettings();
  return ensureAdminUserFromEnv();
}

export { SYSTEM_SETTINGS_ID };
