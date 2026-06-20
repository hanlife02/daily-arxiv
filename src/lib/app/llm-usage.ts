import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmCallLog, user } from "@/lib/db/schema";
import { getAdminSettings } from "@/lib/app/settings";
import { summarizeLlmUsage, type LlmModelCostRate } from "@/lib/app/llm-usage-summary";
import { resolveManualLlmLimits, summarizeManualLlmQuota } from "@/lib/settings/limits";
import { MANUAL_LLM_ENDPOINTS, type LlmEndpoint } from "@/lib/app/llm-endpoints";

export { MANUAL_LLM_ENDPOINTS, isManualLlmEndpoint, type LlmEndpoint, type ManualLlmEndpoint } from "@/lib/app/llm-endpoints";

const manualLlmEndpointList: LlmEndpoint[] = [...MANUAL_LLM_ENDPOINTS];

export async function startLlmCall(input: {
  userId?: string;
  paperId?: string;
  reportId?: string;
  endpoint: LlmEndpoint;
  model: string;
  promptChars: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  usedPdfText?: boolean;
}) {
  const id = randomUUID();
  const startedAt = new Date();
  await db.insert(llmCallLog).values({
    id,
    userId: input.userId,
    paperId: input.paperId,
    reportId: input.reportId,
    endpoint: input.endpoint,
    model: input.model,
    status: "started",
    promptChars: input.promptChars,
    completionChars: 0,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    usedPdfText: input.usedPdfText ?? false,
    startedAt,
    createdAt: startedAt
  });
  return { id, startedAt };
}

export async function finishLlmCall(
  id: string,
  input: {
    status: "succeeded" | "failed";
    completionChars?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    error?: string;
  }
) {
  const values = {
    status: input.status,
    completionChars: input.completionChars ?? 0,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    error: input.error,
    finishedAt: new Date()
  };
  await db
    .update(llmCallLog)
    .set(values)
    .where(eq(llmCallLog.id, id));
}

function todayStart(now = new Date()) {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  return since;
}

export async function getManualLlmQuotaStatus(userId: string, now = new Date()) {
  const settings = await getAdminSettings();
  const since = todayStart(now);
  const [targetUser, todayRows, runningRows] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(llmCallLog)
      .where(and(eq(llmCallLog.userId, userId), inArray(llmCallLog.endpoint, manualLlmEndpointList), gte(llmCallLog.createdAt, since))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(llmCallLog)
      .where(and(eq(llmCallLog.userId, userId), eq(llmCallLog.status, "started"), inArray(llmCallLog.endpoint, manualLlmEndpointList)))
  ]);
  const limits = resolveManualLlmLimits({
    globalManualLlmCallsPerUserPerDay: settings.manualLlmCallsPerUserPerDay,
    globalConcurrentManualLlmCallsPerUser: settings.concurrentManualLlmCallsPerUser,
    role: targetUser?.role,
    userRoleManualLlmCallsPerUserPerDay: settings.userRoleManualLlmCallsPerUserPerDay,
    userRoleConcurrentManualLlmCallsPerUser: settings.userRoleConcurrentManualLlmCallsPerUser,
    adminRoleManualLlmCallsPerUserPerDay: settings.adminRoleManualLlmCallsPerUserPerDay,
    adminRoleConcurrentManualLlmCallsPerUser: settings.adminRoleConcurrentManualLlmCallsPerUser,
    userManualLlmCallsPerUserPerDayOverride: targetUser?.manualLlmCallsPerUserPerDayOverride,
    userConcurrentManualLlmCallsPerUserOverride: targetUser?.concurrentManualLlmCallsPerUserOverride
  });

  return summarizeManualLlmQuota({
    usedToday: todayRows[0]?.count ?? 0,
    running: runningRows[0]?.count ?? 0,
    manualLlmCallsPerUserPerDay: limits.manualLlmCallsPerUserPerDay,
    concurrentManualLlmCallsPerUser: limits.concurrentManualLlmCallsPerUser
  });
}

export async function assertManualLlmAllowed(userId: string) {
  const quota = await getManualLlmQuotaStatus(userId);
  if (quota.dailyExceeded) {
    throw new Error("今日 AI 阅读调用次数已达上限");
  }

  if (quota.concurrentExceeded) {
    throw new Error("已有 AI 阅读任务正在进行，请稍后再试");
  }
}

function parseLlmCostRatesFromEnv(): Record<string, LlmModelCostRate> {
  const raw = process.env.LLM_COST_RATES_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, {
      promptUsdPerMillionTokens?: number;
      completionUsdPerMillionTokens?: number;
      inputUsdPerMillionTokens?: number;
      outputUsdPerMillionTokens?: number;
    }>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([model, rate]) => {
          const prompt = Number(rate.promptUsdPerMillionTokens ?? rate.inputUsdPerMillionTokens);
          const completion = Number(rate.completionUsdPerMillionTokens ?? rate.outputUsdPerMillionTokens);
          if (!model || !Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) {
            return undefined;
          }
          return [model, {
            promptUsdPerMillionTokens: prompt,
            completionUsdPerMillionTokens: completion
          }] as const;
        })
        .filter((item): item is readonly [string, LlmModelCostRate] => Boolean(item))
    );
  } catch {
    return {};
  }
}

function llmCostCharsPerTokenFromEnv() {
  const parsed = Number(process.env.LLM_COST_CHARS_PER_TOKEN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

export async function getLlmUsageSummary(now = new Date()) {
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db.query.llmCallLog.findMany({
    where: gte(llmCallLog.createdAt, since),
    orderBy: llmCallLog.createdAt,
    limit: 5000
  });
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  const userRows = userIds.length > 0
    ? await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds))
    : [];
  const userLabels = Object.fromEntries(userRows.map((row) => [row.id, row.email]));

  return summarizeLlmUsage(rows, {
    now,
    windows: [7, 30, 90],
    trendDays: 90,
    insightDays: 90,
    userLabels,
    costSettings: {
      charsPerToken: llmCostCharsPerTokenFromEnv(),
      rates: parseLlmCostRatesFromEnv()
    }
  });
}
