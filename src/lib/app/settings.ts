import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, adminSetting, userLlmConfig, userPreference, userSmtpConfig } from "@/lib/db/schema";
import { validateArxivCategories } from "@/lib/arxiv/categories";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import type { LlmConfig } from "@/lib/llm/chat-completions";
import { DEFAULT_LIMITS, clampTopN } from "@/lib/settings/limits";
import { SYSTEM_SETTINGS_ID } from "@/lib/app/bootstrap";

export async function getDecryptedLlmConfig(userId: string): Promise<LlmConfig | undefined> {
  const config = await db.query.userLlmConfig.findFirst({
    where: eq(userLlmConfig.userId, userId)
  });
  if (!config) return undefined;
  return {
    baseUrl: config.baseUrl,
    apiKey: decryptSecret(config.encryptedApiKey),
    model: config.model
  };
}

export async function getAdminSettings() {
  const existing = await db.query.adminSetting.findFirst({
    where: eq(adminSetting.id, SYSTEM_SETTINGS_ID)
  });
  if (existing) return existing;
  const [created] = await db.insert(adminSetting).values({ id: SYSTEM_SETTINGS_ID }).returning();
  return created;
}

export async function upsertUserPreference(
  userId: string,
  input: {
    categories: string[];
    includeKeywords: string[];
    excludeKeywords: string[];
    topN: number;
    sendTime: string;
    timezone: string;
    summaryFocus?: string | null;
  }
) {
  const validated = validateArxivCategories(input.categories);
  if (!validated.ok) {
    throw new Error(`Invalid arXiv categories: ${validated.invalid.join(", ")}`);
  }

  const values = {
    userId,
    categories: validated.valid,
    includeKeywords: input.includeKeywords,
    excludeKeywords: input.excludeKeywords,
    topN: clampTopN(input.topN, DEFAULT_LIMITS.automaticReportTopNMax),
    sendTime: input.sendTime || "09:00",
    timezone: input.timezone || "Asia/Shanghai",
    summaryFocus: input.summaryFocus || null,
    updatedAt: new Date()
  };

  await db
    .insert(userPreference)
    .values(values)
    .onConflictDoUpdate({
      target: userPreference.userId,
      set: values
    });
}

export async function upsertUserLlmConfig(userId: string, input: { baseUrl: string; apiKey?: string; model: string }) {
  const existing = await db.query.userLlmConfig.findFirst({
    where: eq(userLlmConfig.userId, userId)
  });
  if (!input.baseUrl || !input.model) throw new Error("Base URL and model are required");
  const encryptedApiKey = input.apiKey ? encryptSecret(input.apiKey) : existing?.encryptedApiKey;
  if (!encryptedApiKey) throw new Error("API Key is required");

  const values = {
    userId,
    baseUrl: input.baseUrl,
    encryptedApiKey,
    model: input.model,
    updatedAt: new Date()
  };

  await db
    .insert(userLlmConfig)
    .values(values)
    .onConflictDoUpdate({
      target: userLlmConfig.userId,
      set: values
    });
}

export async function upsertUserSmtpConfig(
  userId: string,
  input: { host: string; port: number; secure: boolean; from: string; username?: string | null; password?: string | null }
) {
  const existing = await db.query.userSmtpConfig.findFirst({
    where: eq(userSmtpConfig.userId, userId)
  });
  if (!input.host || !input.port || !input.from) throw new Error("SMTP host, port and from are required");

  const encryptedPassword = input.password ? encryptSecret(input.password) : existing?.encryptedPassword ?? null;
  const values = {
    userId,
    host: input.host,
    port: input.port,
    secure: input.secure,
    from: input.from,
    username: input.username || null,
    encryptedPassword,
    updatedAt: new Date()
  };

  await db
    .insert(userSmtpConfig)
    .values(values)
    .onConflictDoUpdate({
      target: userSmtpConfig.userId,
      set: values
    });
}

export async function upsertAdminSettings(input: {
  notificationFallbackEnabled: boolean;
  dailyEmailLimit: number;
  emailRetryCount: number;
  arxivMaxResultsPerCategory: number;
}) {
  const values = {
    id: SYSTEM_SETTINGS_ID,
    notificationFallbackEnabled: input.notificationFallbackEnabled,
    dailyEmailLimit: Math.max(0, Math.floor(input.dailyEmailLimit)),
    emailRetryCount: Math.max(0, Math.floor(input.emailRetryCount)),
    arxivMaxResultsPerCategory: Math.max(10, Math.floor(input.arxivMaxResultsPerCategory)),
    updatedAt: new Date()
  };
  await db
    .insert(adminSetting)
    .values(values)
    .onConflictDoUpdate({
      target: adminSetting.id,
      set: values
    });
}

export async function upsertAdminNotificationSmtp(input: {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string | null;
  password?: string | null;
}) {
  const existing = await db.query.adminNotificationSmtpConfig.findFirst({
    where: eq(adminNotificationSmtpConfig.id, SYSTEM_SETTINGS_ID)
  });
  const encryptedPassword = input.password ? encryptSecret(input.password) : existing?.encryptedPassword ?? null;
  const values = {
    id: SYSTEM_SETTINGS_ID,
    enabled: input.enabled,
    host: input.host,
    port: input.port,
    secure: input.secure,
    from: input.from,
    username: input.username || null,
    encryptedPassword,
    updatedAt: new Date()
  };
  await db
    .insert(adminNotificationSmtpConfig)
    .values(values)
    .onConflictDoUpdate({
      target: adminNotificationSmtpConfig.id,
      set: values
    });
}
