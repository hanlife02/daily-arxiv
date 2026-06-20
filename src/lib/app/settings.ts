import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, adminSetting, userLlmConfig, userPreference, userSmtpConfig } from "@/lib/db/schema";
import { validateArxivCategories } from "@/lib/arxiv/categories";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import type { LlmConfig } from "@/lib/llm/chat-completions";
import { DEFAULT_LIMITS, clampTopN, normalizeManualLlmLimits } from "@/lib/settings/limits";
import { normalizeSendTime, normalizeTimezone } from "@/lib/settings/preferences";
import { normalizeLlmBaseUrl } from "@/lib/llm/endpoint";
import { SYSTEM_SETTINGS_ID } from "@/lib/app/bootstrap";
import { normalizeSmtpConfig } from "@/lib/email/smtp-config";

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
    categoryWeights?: Record<string, number>;
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
    categoryWeights: Object.fromEntries(
      Object.entries(input.categoryWeights ?? {})
        .filter(([category]) => validated.valid.includes(category))
        .map(([category, weight]) => [category, Math.min(3, Math.max(0.1, Number(weight) || 1))])
    ),
    includeKeywords: input.includeKeywords,
    excludeKeywords: input.excludeKeywords,
    topN: clampTopN(input.topN, DEFAULT_LIMITS.automaticReportTopNMax),
    sendTime: normalizeSendTime(input.sendTime),
    timezone: normalizeTimezone(input.timezone),
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
  const baseUrl = normalizeLlmBaseUrl(input.baseUrl);
  const encryptedApiKey = input.apiKey ? encryptSecret(input.apiKey) : existing?.encryptedApiKey;
  if (!encryptedApiKey) throw new Error("API Key is required");

  const values = {
    userId,
    baseUrl,
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
  const smtp = normalizeSmtpConfig(input);

  const encryptedPassword = smtp.password ? encryptSecret(smtp.password) : existing?.encryptedPassword ?? null;
  const values = {
    userId,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    from: smtp.from,
    username: smtp.username,
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
  manualLlmCallsPerUserPerDay?: number;
  concurrentManualLlmCallsPerUser?: number;
  userRoleManualLlmCallsPerUserPerDay?: number | null;
  userRoleConcurrentManualLlmCallsPerUser?: number | null;
  adminRoleManualLlmCallsPerUserPerDay?: number | null;
  adminRoleConcurrentManualLlmCallsPerUser?: number | null;
  logRetentionDays?: number;
  pdfTextRetentionDays?: number;
  backupRetentionDays?: number;
}) {
  const llmLimits = normalizeManualLlmLimits(input);
  const optionalLimit = (value?: number | null) => value === null || value === undefined
    ? null
    : Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const values = {
    id: SYSTEM_SETTINGS_ID,
    notificationFallbackEnabled: input.notificationFallbackEnabled,
    dailyEmailLimit: Math.max(0, Math.floor(input.dailyEmailLimit)),
    emailRetryCount: Math.max(0, Math.floor(input.emailRetryCount)),
    arxivMaxResultsPerCategory: Math.max(10, Math.floor(input.arxivMaxResultsPerCategory)),
    manualLlmCallsPerUserPerDay: llmLimits.manualLlmCallsPerUserPerDay,
    concurrentManualLlmCallsPerUser: llmLimits.concurrentManualLlmCallsPerUser,
    userRoleManualLlmCallsPerUserPerDay: optionalLimit(input.userRoleManualLlmCallsPerUserPerDay),
    userRoleConcurrentManualLlmCallsPerUser: optionalLimit(input.userRoleConcurrentManualLlmCallsPerUser),
    adminRoleManualLlmCallsPerUserPerDay: optionalLimit(input.adminRoleManualLlmCallsPerUserPerDay),
    adminRoleConcurrentManualLlmCallsPerUser: optionalLimit(input.adminRoleConcurrentManualLlmCallsPerUser),
    logRetentionDays: Math.max(1, Math.floor(input.logRetentionDays ?? 30)),
    pdfTextRetentionDays: Math.max(1, Math.floor(input.pdfTextRetentionDays ?? 30)),
    backupRetentionDays: Math.max(1, Math.floor(input.backupRetentionDays ?? 7)),
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
  const smtp = normalizeSmtpConfig(input);
  const encryptedPassword = smtp.password ? encryptSecret(smtp.password) : existing?.encryptedPassword ?? null;
  const values = {
    id: SYSTEM_SETTINGS_ID,
    enabled: input.enabled,
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    from: smtp.from,
    username: smtp.username,
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

export async function deleteAdminNotificationSmtp() {
  await db.delete(adminNotificationSmtpConfig).where(eq(adminNotificationSmtpConfig.id, SYSTEM_SETTINGS_ID));
}
