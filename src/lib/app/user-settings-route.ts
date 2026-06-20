import { booleanFromForm, numberFromForm, splitList, stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";

export type SettingsRouteUser = {
  id: string;
};

export type UserPreferenceSettingsInput = {
  categories: string[];
  categoryWeights?: Record<string, number>;
  includeKeywords: string[];
  excludeKeywords: string[];
  topN: number;
  sendTime: string;
  timezone: string;
  summaryFocus?: string | null;
};

export type UserLlmConfigInput = {
  baseUrl: string;
  apiKey?: string;
  model: string;
};

export type UserSmtpConfigInput = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string | null;
  password?: string | null;
};

export type UserPreferenceSettingsDependencies = {
  requireUser: () => Promise<SettingsRouteUser>;
  upsertUserPreference: (userId: string, input: UserPreferenceSettingsInput) => Promise<void>;
};

export type UserLlmConfigDependencies = {
  requireUser: () => Promise<SettingsRouteUser>;
  upsertUserLlmConfig: (userId: string, input: UserLlmConfigInput) => Promise<void>;
};

export type UserSmtpConfigDependencies = {
  requireUser: () => Promise<SettingsRouteUser>;
  upsertUserSmtpConfig: (userId: string, input: UserSmtpConfigInput) => Promise<void>;
};

function categoryWeightsFromForm(form: FormData) {
  return Object.fromEntries(
    [...form.entries()]
      .filter(([key]) => key.startsWith("categoryWeight:"))
      .map(([key, value]) => [key.slice("categoryWeight:".length), Number(value)])
  );
}

export function createUserPreferenceSettingsHandler(deps: UserPreferenceSettingsDependencies) {
  return async function post(request: Request) {
    const user = await deps.requireUser();
    const form = await request.formData();
    try {
      await deps.upsertUserPreference(user.id, {
        categories: splitList(form.get("categories")),
        categoryWeights: categoryWeightsFromForm(form),
        includeKeywords: splitList(form.get("includeKeywords")),
        excludeKeywords: splitList(form.get("excludeKeywords")),
        topN: numberFromForm(form.get("topN"), 5),
        sendTime: stringFromForm(form.get("sendTime"), "09:00"),
        timezone: stringFromForm(form.get("timezone"), "Asia/Shanghai"),
        summaryFocus: stringFromForm(form.get("summaryFocus"))
      });
      return redirectToApp("/settings?saved=preferences", request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save preferences";
      return redirectToApp(`/settings?error=${encodeURIComponent(message)}`, request);
    }
  };
}

export function createUserLlmConfigHandler(deps: UserLlmConfigDependencies) {
  return async function post(request: Request) {
    const user = await deps.requireUser();
    const form = await request.formData();
    try {
      await deps.upsertUserLlmConfig(user.id, {
        baseUrl: stringFromForm(form.get("baseUrl")),
        apiKey: stringFromForm(form.get("apiKey")),
        model: stringFromForm(form.get("model"))
      });
      return redirectToApp("/settings?saved=llm", request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save LLM config";
      return redirectToApp(`/settings?error=${encodeURIComponent(message)}`, request);
    }
  };
}

export function createUserSmtpConfigHandler(deps: UserSmtpConfigDependencies) {
  return async function post(request: Request) {
    const user = await deps.requireUser();
    const form = await request.formData();
    try {
      await deps.upsertUserSmtpConfig(user.id, {
        host: stringFromForm(form.get("host")),
        port: numberFromForm(form.get("port"), 587),
        secure: booleanFromForm(form.get("secure")),
        from: stringFromForm(form.get("from")),
        username: stringFromForm(form.get("username")) || null,
        password: stringFromForm(form.get("password")) || null
      });
      return redirectToApp("/settings?saved=smtp", request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save SMTP config";
      return redirectToApp(`/settings?error=${encodeURIComponent(message)}`, request);
    }
  };
}
