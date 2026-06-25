import { randomUUID } from "node:crypto";
import { booleanFromForm, numberFromForm, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";
import { hasSmtpConfigIntent } from "@/lib/email/smtp-config";
import { normalizeAllowedEmailDomain } from "@/lib/users/registration";

export type AdminSettingsRouteUser = {
  id: string;
};

export type AdminSettingsInput = {
  notificationFallbackEnabled: boolean;
  dailyEmailLimit: number;
  emailRetryCount: number;
  arxivMaxResultsPerCategory: number;
  manualLlmCallsPerUserPerDay: number;
  concurrentManualLlmCallsPerUser: number;
  userRoleManualLlmCallsPerUserPerDay: number | null;
  userRoleConcurrentManualLlmCallsPerUser: number | null;
  adminRoleManualLlmCallsPerUserPerDay: number | null;
  adminRoleConcurrentManualLlmCallsPerUser: number | null;
  logRetentionDays: number;
  pdfTextRetentionDays: number;
  backupRetentionDays: number;
};

export type AdminNotificationSmtpInput = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string | null;
  password?: string | null;
};

export type AllowedEmailDomainInput = {
  id: string;
  domain: string;
  enabled: boolean;
};

export type AdminSettingsDependencies = {
  requireAdmin: () => Promise<AdminSettingsRouteUser>;
  upsertAdminSettings: (input: AdminSettingsInput) => Promise<void>;
  upsertAdminNotificationSmtp: (input: AdminNotificationSmtpInput) => Promise<void>;
  deleteAdminNotificationSmtp: () => Promise<void>;
};

export type AdminDomainDependencies = {
  requireAdmin: () => Promise<AdminSettingsRouteUser>;
  setDomainEnabled: (domainId: string, enabled: boolean) => Promise<void>;
  upsertAllowedEmailDomain: (input: AllowedEmailDomainInput) => Promise<void>;
  randomId?: () => string;
};

function optionalNumberFromForm(value: FormDataEntryValue | null) {
  const raw = stringFromForm(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function createAdminSettingsHandler(deps: AdminSettingsDependencies) {
  return async function post(request: Request) {
    await deps.requireAdmin();
    const form = await request.formData();
    try {
      await deps.upsertAdminSettings({
        notificationFallbackEnabled: booleanFromForm(form.get("notificationFallbackEnabled")),
        dailyEmailLimit: numberFromForm(form.get("dailyEmailLimit"), 10),
        emailRetryCount: numberFromForm(form.get("emailRetryCount"), 2),
        arxivMaxResultsPerCategory: numberFromForm(form.get("arxivMaxResultsPerCategory"), 100),
        manualLlmCallsPerUserPerDay: numberFromForm(form.get("manualLlmCallsPerUserPerDay"), 50),
        concurrentManualLlmCallsPerUser: numberFromForm(form.get("concurrentManualLlmCallsPerUser"), 1),
        userRoleManualLlmCallsPerUserPerDay: optionalNumberFromForm(form.get("userRoleManualLlmCallsPerUserPerDay")),
        userRoleConcurrentManualLlmCallsPerUser: optionalNumberFromForm(form.get("userRoleConcurrentManualLlmCallsPerUser")),
        adminRoleManualLlmCallsPerUserPerDay: optionalNumberFromForm(form.get("adminRoleManualLlmCallsPerUserPerDay")),
        adminRoleConcurrentManualLlmCallsPerUser: optionalNumberFromForm(form.get("adminRoleConcurrentManualLlmCallsPerUser")),
        logRetentionDays: numberFromForm(form.get("logRetentionDays"), 30),
        pdfTextRetentionDays: numberFromForm(form.get("pdfTextRetentionDays"), 30),
        backupRetentionDays: numberFromForm(form.get("backupRetentionDays"), 7)
      });

      const smtpEnabled = booleanFromForm(form.get("smtpEnabled"));
      const smtpHost = stringFromForm(form.get("smtpHost"));
      const smtpFrom = stringFromForm(form.get("smtpFrom"));
      const smtpUsername = stringFromForm(form.get("smtpUsername"));
      const smtpPassword = stringFromForm(form.get("smtpPassword"));
      if (hasSmtpConfigIntent({ enabled: smtpEnabled, host: smtpHost, from: smtpFrom, username: smtpUsername, password: smtpPassword })) {
        await deps.upsertAdminNotificationSmtp({
          enabled: smtpEnabled,
          host: smtpHost,
          port: numberFromForm(form.get("smtpPort"), 587),
          secure: booleanFromForm(form.get("smtpSecure")),
          from: smtpFrom,
          username: smtpUsername || null,
          password: smtpPassword || null
        });
      } else {
        await deps.deleteAdminNotificationSmtp();
      }

      return redirectToApp("/admin?saved=settings", request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save admin settings";
      return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
    }
  };
}

export function createAdminDomainHandler(deps: AdminDomainDependencies) {
  return async function post(request: Request) {
    await deps.requireAdmin();
    const form = await request.formData();
    const domainId = stringFromForm(form.get("domainId"));
    if (domainId) {
      await deps.setDomainEnabled(domainId, booleanFromForm(form.get("enabled")));
      return redirectToApp("/admin?saved=domain", request);
    }

    let domain: string;
    try {
      domain = normalizeAllowedEmailDomain(stringFromForm(form.get("domain")));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid domain";
      return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
    }

    await deps.upsertAllowedEmailDomain({
      id: (deps.randomId ?? randomUUID)(),
      domain,
      enabled: true
    });
    return redirectToApp("/admin?saved=domain", request);
  };
}
