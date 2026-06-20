import { describe, expect, it, vi } from "vitest";
import { createAdminDomainHandler, createAdminSettingsHandler } from "@/lib/app/admin-settings-route";
import { createUserLlmConfigHandler, createUserPreferenceSettingsHandler, createUserSmtpConfigHandler } from "@/lib/app/user-settings-route";

function postRequest(body: URLSearchParams, url = "http://localhost/api/settings/preferences") {
  return new Request(url, {
    method: "POST",
    body
  });
}

describe("user settings route handlers", () => {
  it("saves user preferences from form values", async () => {
    const upsertUserPreference = vi.fn().mockResolvedValue(undefined);
    const handler = createUserPreferenceSettingsHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      upsertUserPreference
    });

    const response = await handler(postRequest(new URLSearchParams({
      categories: "cs.AI\ncs.LG",
      "categoryWeight:cs.AI": "2.5",
      "categoryWeight:cs.LG": "bad",
      includeKeywords: "rag, agent",
      excludeKeywords: "survey，benchmark",
      topN: "7",
      sendTime: "08:30",
      timezone: "Europe/London",
      summaryFocus: "novelty"
    })));

    expect(upsertUserPreference).toHaveBeenCalledWith("user-1", {
      categories: ["cs.AI", "cs.LG"],
      categoryWeights: {
        "cs.AI": 2.5,
        "cs.LG": Number.NaN
      },
      includeKeywords: ["rag", "agent"],
      excludeKeywords: ["survey", "benchmark"],
      topN: 7,
      sendTime: "08:30",
      timezone: "Europe/London",
      summaryFocus: "novelty"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/settings?saved=preferences");
  });

  it("redirects user preference save failures back to settings", async () => {
    const handler = createUserPreferenceSettingsHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      upsertUserPreference: vi.fn().mockRejectedValue(new Error("bad category"))
    });

    const response = await handler(postRequest(new URLSearchParams()));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/settings?error=bad%20category");
  });

  it("saves user LLM config from trimmed form values", async () => {
    const upsertUserLlmConfig = vi.fn().mockResolvedValue(undefined);
    const handler = createUserLlmConfigHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      upsertUserLlmConfig
    });

    const response = await handler(postRequest(
      new URLSearchParams({
        baseUrl: " https://llm.example/v1 ",
        apiKey: " key-123 ",
        model: " model-a "
      }),
      "http://localhost/api/settings/llm"
    ));

    expect(upsertUserLlmConfig).toHaveBeenCalledWith("user-1", {
      baseUrl: "https://llm.example/v1",
      apiKey: "key-123",
      model: "model-a"
    });
    expect(response.headers.get("location")).toBe("http://localhost/settings?saved=llm");
  });

  it("saves user SMTP config with defaults and nullable credentials", async () => {
    const upsertUserSmtpConfig = vi.fn().mockResolvedValue(undefined);
    const handler = createUserSmtpConfigHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      upsertUserSmtpConfig
    });

    const response = await handler(postRequest(
      new URLSearchParams({
        host: " smtp.example.com ",
        port: "",
        secure: "on",
        from: " alerts@example.com ",
        username: " ",
        password: " secret "
      }),
      "http://localhost/api/settings/smtp"
    ));

    expect(upsertUserSmtpConfig).toHaveBeenCalledWith("user-1", {
      host: "smtp.example.com",
      port: 587,
      secure: true,
      from: "alerts@example.com",
      username: null,
      password: "secret"
    });
    expect(response.headers.get("location")).toBe("http://localhost/settings?saved=smtp");
  });
});

describe("admin settings route handler", () => {
  it("saves admin policy settings and notification SMTP config", async () => {
    const upsertAdminSettings = vi.fn().mockResolvedValue(undefined);
    const upsertAdminNotificationSmtp = vi.fn().mockResolvedValue(undefined);
    const deleteAdminNotificationSmtp = vi.fn().mockResolvedValue(undefined);
    const handler = createAdminSettingsHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      upsertAdminSettings,
      upsertAdminNotificationSmtp,
      deleteAdminNotificationSmtp
    });

    const response = await handler(postRequest(
      new URLSearchParams({
        notificationFallbackEnabled: "on",
        dailyEmailLimit: "25",
        emailRetryCount: "4",
        arxivMaxResultsPerCategory: "150",
        manualLlmCallsPerUserPerDay: "80",
        concurrentManualLlmCallsPerUser: "2",
        userRoleManualLlmCallsPerUserPerDay: "40",
        userRoleConcurrentManualLlmCallsPerUser: "",
        adminRoleManualLlmCallsPerUserPerDay: "200",
        adminRoleConcurrentManualLlmCallsPerUser: "5",
        logRetentionDays: "45",
        pdfTextRetentionDays: "60",
        backupRetentionDays: "10",
        smtpEnabled: "on",
        smtpHost: " smtp.admin.example ",
        smtpPort: "465",
        smtpSecure: "true",
        smtpFrom: " ops@example.com ",
        smtpUsername: " ops ",
        smtpPassword: " pass "
      }),
      "http://localhost/api/admin/settings"
    ));

    expect(upsertAdminSettings).toHaveBeenCalledWith({
      notificationFallbackEnabled: true,
      dailyEmailLimit: 25,
      emailRetryCount: 4,
      arxivMaxResultsPerCategory: 150,
      manualLlmCallsPerUserPerDay: 80,
      concurrentManualLlmCallsPerUser: 2,
      userRoleManualLlmCallsPerUserPerDay: 40,
      userRoleConcurrentManualLlmCallsPerUser: null,
      adminRoleManualLlmCallsPerUserPerDay: 200,
      adminRoleConcurrentManualLlmCallsPerUser: 5,
      logRetentionDays: 45,
      pdfTextRetentionDays: 60,
      backupRetentionDays: 10
    });
    expect(upsertAdminNotificationSmtp).toHaveBeenCalledWith({
      enabled: true,
      host: "smtp.admin.example",
      port: 465,
      secure: true,
      from: "ops@example.com",
      username: "ops",
      password: "pass"
    });
    expect(deleteAdminNotificationSmtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/admin?saved=settings");
  });

  it("deletes admin notification SMTP config when the form has no SMTP intent", async () => {
    const upsertAdminNotificationSmtp = vi.fn().mockResolvedValue(undefined);
    const deleteAdminNotificationSmtp = vi.fn().mockResolvedValue(undefined);
    const handler = createAdminSettingsHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      upsertAdminSettings: vi.fn().mockResolvedValue(undefined),
      upsertAdminNotificationSmtp,
      deleteAdminNotificationSmtp
    });

    const response = await handler(postRequest(new URLSearchParams(), "http://localhost/api/admin/settings"));

    expect(upsertAdminNotificationSmtp).not.toHaveBeenCalled();
    expect(deleteAdminNotificationSmtp).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/admin?saved=settings");
  });
});

describe("admin domain route handler", () => {
  it("updates an existing domain enabled flag", async () => {
    const setDomainEnabled = vi.fn().mockResolvedValue(undefined);
    const upsertAllowedEmailDomain = vi.fn().mockResolvedValue(undefined);
    const handler = createAdminDomainHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      setDomainEnabled,
      upsertAllowedEmailDomain
    });

    const response = await handler(postRequest(
      new URLSearchParams({ domainId: "domain-1", enabled: "on" }),
      "http://localhost/api/admin/domains"
    ));

    expect(setDomainEnabled).toHaveBeenCalledWith("domain-1", true);
    expect(upsertAllowedEmailDomain).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost/admin?saved=domain");
  });

  it("normalizes and upserts a new allowed email domain", async () => {
    const setDomainEnabled = vi.fn().mockResolvedValue(undefined);
    const upsertAllowedEmailDomain = vi.fn().mockResolvedValue(undefined);
    const handler = createAdminDomainHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      setDomainEnabled,
      upsertAllowedEmailDomain,
      randomId: () => "domain-id-1"
    });

    const response = await handler(postRequest(
      new URLSearchParams({ domain: " Example.EDU " }),
      "http://localhost/api/admin/domains"
    ));

    expect(setDomainEnabled).not.toHaveBeenCalled();
    expect(upsertAllowedEmailDomain).toHaveBeenCalledWith({
      id: "domain-id-1",
      domain: "example.edu",
      enabled: true
    });
    expect(response.headers.get("location")).toBe("http://localhost/admin?saved=domain");
  });

  it("redirects invalid domains without writing", async () => {
    const upsertAllowedEmailDomain = vi.fn().mockResolvedValue(undefined);
    const handler = createAdminDomainHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      setDomainEnabled: vi.fn().mockResolvedValue(undefined),
      upsertAllowedEmailDomain,
      randomId: () => "domain-id-1"
    });

    const response = await handler(postRequest(
      new URLSearchParams({ domain: "https://example.edu/path" }),
      "http://localhost/api/admin/domains"
    ));

    expect(upsertAllowedEmailDomain).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin?error=Invalid%20email%20domain");
  });
});
