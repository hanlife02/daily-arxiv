import { and, eq, inArray } from "drizzle-orm";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { buildUserPortableImportPlan } from "@/lib/app/exports";
import { redirectToApp } from "@/lib/app/http";
import { upsertUserPreference } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { paper, userPaperState, userPreference } from "@/lib/db/schema";

async function importText(value: FormDataEntryValue | null) {
  if (!value) throw new Error("请选择要导入的 JSON 文件");
  return typeof value === "string" ? value : value.text();
}

type UserImportPreference = NonNullable<ReturnType<typeof buildUserPortableImportPlan>["preference"]>;
type UserImportReadingState = ReturnType<typeof buildUserPortableImportPlan>["readingStates"][number];

const USER_PREFERENCE_DIFF_FIELDS = [
  ["categories", "分类"],
  ["categoryWeights", "分类权重"],
  ["includeKeywords", "包含关键词"],
  ["excludeKeywords", "排除关键词"],
  ["topN", "Top N"],
  ["sendTime", "推送时间"],
  ["timezone", "时区"],
  ["summaryFocus", "总结关注点"]
] as const satisfies ReadonlyArray<readonly [keyof UserImportPreference, string]>;

function comparableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparableValue(item)])
    );
  }
  return value ?? null;
}

function diffPreferenceFields(next: UserImportPreference, current: UserImportPreference | null) {
  if (!current) return USER_PREFERENCE_DIFF_FIELDS.map(([, label]) => label);
  return USER_PREFERENCE_DIFF_FIELDS
    .filter(([key]) => JSON.stringify(comparableValue(next[key])) !== JSON.stringify(comparableValue(current[key])))
    .map(([, label]) => label);
}

function dateKey(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function readingStateWillChange(
  next: UserImportReadingState,
  current: Pick<UserImportReadingState, "favorited" | "read" | "ignored" | "recommendedAt">
) {
  const nextRecommendedAt = next.recommendedAt ?? current.recommendedAt ?? null;
  return (
    next.favorited !== current.favorited ||
    next.read !== current.read ||
    next.ignored !== current.ignored ||
    dateKey(nextRecommendedAt) !== dateKey(current.recommendedAt)
  );
}

async function post(request: Request) {
  const user = await requireApiUser();
  const form = await request.formData();

  try {
    const raw = await importText(form.get("portableExport"));
    const payload = JSON.parse(raw);
    const plan = buildUserPortableImportPlan(payload);
    const mode = form.get("mode") === "preview" ? "preview" : "apply";
    const selectedPreference = form.get("includePreference") === "on" ? plan.preference : null;
    const selectedReadingStates = form.get("includeReadingStates") === "on" ? plan.readingStates : [];

    const paperIds = selectedReadingStates.map((state) => state.paperId);
    const existingPapers = paperIds.length
      ? await db.query.paper.findMany({ where: inArray(paper.arxivId, paperIds) })
      : [];
    const existingPaperIds = new Set(existingPapers.map((item) => item.arxivId));
    const importableStates = selectedReadingStates.filter((state) => existingPaperIds.has(state.paperId));
    const existingPreference = selectedPreference
      ? await db.query.userPreference.findFirst({ where: eq(userPreference.userId, user.id) })
      : null;
    const existingStates = importableStates.length > 0
      ? await db.query.userPaperState.findMany({
          where: and(eq(userPaperState.userId, user.id), inArray(userPaperState.paperId, importableStates.map((state) => state.paperId)))
        })
      : [];
    const existingByPaperId = new Map(existingStates.map((state) => [state.paperId, state]));
    const overwriteStates = existingStates.length;
    const createStates = importableStates.length - overwriteStates;
    const changedStates = importableStates
      .filter((state) => {
        const existing = existingByPaperId.get(state.paperId);
        return existing ? readingStateWillChange(state, existing) : false;
      })
      .length;
    const preferenceFields = selectedPreference
      ? diffPreferenceFields(selectedPreference, existingPreference ?? null).join(",") || "无变化"
      : "";
    const imported = [
      selectedPreference ? "偏好" : "",
      importableStates.length ? `${importableStates.length} 条阅读状态` : ""
    ].filter(Boolean).join(", ") || "没有可导入数据";
    const skipped = selectedReadingStates.length - importableStates.length;
    const queryParams = new URLSearchParams({
      imported,
      skipped: String(skipped),
      overwritePreference: String(existingPreference ? 1 : 0),
      overwriteStates: String(overwriteStates),
      createStates: String(createStates)
    });
    if (preferenceFields) queryParams.set("preferenceFields", preferenceFields);
    if (overwriteStates > 0) queryParams.set("changedStates", String(changedStates));
    const query = queryParams.toString();

    if (mode === "preview") {
      return redirectToApp(`/settings?saved=import-preview&${query}`, request);
    }

    if (form.get("confirmImport") !== "on") {
      throw new Error("请先勾选确认导入");
    }

    if (selectedPreference) {
      await upsertUserPreference(user.id, selectedPreference);
    }

    if (importableStates.length > 0) {
      const updatedAt = new Date();

      for (const state of importableStates) {
        const existing = existingByPaperId.get(state.paperId);
        const value = {
          userId: user.id,
          paperId: state.paperId,
          favorited: state.favorited,
          read: state.read,
          ignored: state.ignored,
          recommendedAt: state.recommendedAt ?? existing?.recommendedAt ?? null,
          updatedAt
        };
        await db
          .insert(userPaperState)
          .values(value)
          .onConflictDoUpdate({
            target: [userPaperState.userId, userPaperState.paperId],
            set: {
              favorited: value.favorited,
              read: value.read,
              ignored: value.ignored,
              recommendedAt: value.recommendedAt,
              updatedAt: value.updatedAt
            }
          });
      }
    }

    return redirectToApp(`/settings?saved=import&${query}`, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return redirectToApp(`/settings?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
