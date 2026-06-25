import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { buildAdminPortableImportPlan } from "@/lib/app/exports";
import { redirectToApp } from "@/lib/app/http";
import { getAdminSettings, upsertAdminSettings } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { allowedEmailDomain, user } from "@/lib/db/schema";

async function importText(value: FormDataEntryValue | null) {
  if (!value) throw new Error("请选择要导入的 JSON 文件");
  return typeof value === "string" ? value : value.text();
}

type AdminImportSettings = NonNullable<ReturnType<typeof buildAdminPortableImportPlan>["settings"]>;

const ADMIN_SETTINGS_DIFF_FIELDS = [
  ["notificationFallbackEnabled", "管理员 fallback 邮件"],
  ["dailyEmailLimit", "每日邮件上限"],
  ["emailRetryCount", "邮件重试次数"],
  ["arxivMaxResultsPerCategory", "抓取数量"],
  ["manualLlmCallsPerUserPerDay", "AI 阅读每日额度"],
  ["concurrentManualLlmCallsPerUser", "AI 阅读并发额度"],
  ["userRoleManualLlmCallsPerUserPerDay", "用户角色每日额度"],
  ["userRoleConcurrentManualLlmCallsPerUser", "用户角色并发额度"],
  ["adminRoleManualLlmCallsPerUserPerDay", "管理员角色每日额度"],
  ["adminRoleConcurrentManualLlmCallsPerUser", "管理员角色并发额度"],
  ["logRetentionDays", "日志保留天数"],
  ["pdfTextRetentionDays", "PDF 文本保留天数"],
  ["backupRetentionDays", "备份保留天数"]
] as const satisfies ReadonlyArray<readonly [keyof AdminImportSettings, string]>;

function diffAdminSettingsFields(next: AdminImportSettings, current: AdminImportSettings) {
  return ADMIN_SETTINGS_DIFF_FIELDS
    .filter(([key]) => next[key] !== current[key])
    .map(([, label]) => label);
}

async function post(request: Request) {
  await requireApiAdmin();
  const form = await request.formData();

  try {
    const raw = await importText(form.get("portableExport"));
    const payload = JSON.parse(raw);
    const plan = buildAdminPortableImportPlan(payload);
    const mode = form.get("mode") === "preview" ? "preview" : "apply";
    const selectedSettings = form.get("includeSettings") === "on" ? plan.settings : null;
    const selectedDomains = form.get("includeDomains") === "on" ? plan.allowedEmailDomains : [];
    const selectedUsers = form.get("includeUsers") === "on" ? plan.users : [];

    const emails = selectedUsers.map((item) => item.email);
    const matchedUsers = emails.length ? await db.query.user.findMany({ where: inArray(user.email, emails) }) : [];
    const stateByEmail = new Map(selectedUsers.map((item) => [item.email, item]));
    const domains = selectedDomains.map((item) => item.domain);
    const existingDomains = domains.length
      ? await db.query.allowedEmailDomain.findMany({ where: inArray(allowedEmailDomain.domain, domains) })
      : [];
    const currentSettings = selectedSettings ? await getAdminSettings() : null;
    const existingDomainByName = new Map(existingDomains.map((item) => [item.domain, item]));
    const overwriteDomains = existingDomains.length;
    const createDomains = selectedDomains.length - overwriteDomains;
    const changedDomains = selectedDomains
      .filter((domain) => {
        const existing = existingDomainByName.get(domain.domain);
        return existing ? existing.enabled !== domain.enabled : false;
      })
      .length;
    const changedUsers = matchedUsers
      .filter((matched) => {
        const state = stateByEmail.get(matched.email.toLowerCase());
        return state
          ? matched.notificationDisabled !== state.notificationDisabled ||
              matched.manualLlmCallsPerUserPerDayOverride !== state.manualLlmCallsPerUserPerDayOverride ||
              matched.concurrentManualLlmCallsPerUserOverride !== state.concurrentManualLlmCallsPerUserOverride
          : false;
      })
      .length;
    const settingsFields = selectedSettings && currentSettings
      ? diffAdminSettingsFields(selectedSettings, currentSettings).join(",") || "无变化"
      : "";
    const imported = [
      selectedSettings ? "系统设置" : "",
      selectedDomains.length ? `${selectedDomains.length} 个注册后缀` : "",
      matchedUsers.length ? `${matchedUsers.length} 个已有用户状态` : ""
    ].filter(Boolean).join(", ") || "没有可导入数据";
    const skippedUsers = selectedUsers.length - matchedUsers.length;
    const queryParams = new URLSearchParams({
      imported,
      skippedUsers: String(skippedUsers),
      overwriteDomains: String(overwriteDomains),
      createDomains: String(createDomains),
      updateUsers: String(matchedUsers.length)
    });
    if (settingsFields) queryParams.set("settingsFields", settingsFields);
    if (overwriteDomains > 0) queryParams.set("changedDomains", String(changedDomains));
    if (matchedUsers.length > 0) queryParams.set("changedUsers", String(changedUsers));
    const query = queryParams.toString();

    if (mode === "preview") {
      return redirectToApp(`/admin?saved=import-preview&${query}`, request);
    }

    if (form.get("confirmImport") !== "on") {
      throw new Error("请先勾选确认导入");
    }

    if (selectedSettings) {
      await upsertAdminSettings(selectedSettings);
    }

    for (const domain of selectedDomains) {
      await db
        .insert(allowedEmailDomain)
        .values({
          id: randomUUID(),
          domain: domain.domain,
          enabled: domain.enabled
        })
        .onConflictDoUpdate({
          target: allowedEmailDomain.domain,
          set: { enabled: domain.enabled }
        });
    }

    for (const matched of matchedUsers) {
      const state = stateByEmail.get(matched.email.toLowerCase());
      if (!state) continue;
      await db
        .update(user)
        .set({
          notificationDisabled: state.notificationDisabled,
          manualLlmCallsPerUserPerDayOverride: state.manualLlmCallsPerUserPerDayOverride,
          concurrentManualLlmCallsPerUserOverride: state.concurrentManualLlmCallsPerUserOverride,
          updatedAt: new Date()
        })
        .where(eq(user.id, matched.id));
    }

    return redirectToApp(`/admin?saved=import&${query}`, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
  }
}

export const POST = withApiErrorHandling(post);
