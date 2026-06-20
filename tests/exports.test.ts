import { describe, expect, it } from "vitest";
import {
  buildAdminPortableExport,
  buildAdminPortableImportPlan,
  buildUserPortableExport,
  buildUserPortableImportPlan,
  jsonExportResponse
} from "@/lib/app/exports";

const exportedAt = new Date("2026-06-19T10:00:00.000Z");

describe("portable exports", () => {
  it("builds a user export without leaking encrypted secrets", () => {
    const payload = buildUserPortableExport({
      user: {
        id: "user-1",
        name: "Ada",
        email: "ada@example.edu",
        role: "user",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      preference: {
        categories: ["cs.AI"],
        categoryWeights: { "cs.AI": 2 },
        includeKeywords: ["agent"],
        excludeKeywords: ["survey"],
        topN: 5,
        sendTime: "09:00",
        timezone: "Asia/Shanghai",
        summaryFocus: "methods",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        model: "gpt-test",
        encryptedApiKey: "encrypted-api-key",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      smtpConfig: {
        host: "smtp.example.edu",
        port: 587,
        secure: false,
        from: "Daily arXiv <ada@example.edu>",
        username: "ada",
        encryptedPassword: "encrypted-smtp-password",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      reports: [
        {
          id: "report-1",
          batchDate: "2026-06-18",
          status: "succeeded",
          emailStatus: "sent",
          reason: null,
          latestVersion: 2,
          createdAt: new Date("2026-06-18T00:00:00.000Z"),
          updatedAt: new Date("2026-06-18T01:00:00.000Z")
        }
      ],
      reportVersions: [
        {
          reportId: "report-1",
          version: 2,
          selectedPaperIds: ["2501.00001"],
          markdown: "# Daily arXiv",
          model: "gpt-test",
          promptVersion: "daily-arxiv-v1",
          createdAt: new Date("2026-06-18T01:00:00.000Z")
        }
      ],
      paperStates: [
        {
          paperId: "2501.00001",
          favorited: true,
          read: true,
          ignored: false,
          recommendedAt: new Date("2026-06-18T00:00:00.000Z"),
          updatedAt: new Date("2026-06-18T01:00:00.000Z"),
          paper: {
            arxivId: "2501.00001",
            title: "Test Paper",
            authors: ["Ada"],
            categories: ["cs.AI"],
            primaryCategory: "cs.AI",
            arxivUrl: "https://arxiv.org/abs/2501.00001",
            pdfUrl: "https://arxiv.org/pdf/2501.00001",
            publishedAt: new Date("2026-06-18T00:00:00.000Z"),
            updatedAt: new Date("2026-06-18T00:00:00.000Z")
          }
        }
      ]
    }, exportedAt);

    expect(payload.version).toBe("daily-arxiv-user-export-v1");
    expect(payload.exportedAt).toBe("2026-06-19T10:00:00.000Z");
    expect(payload.llmConfig?.hasApiKey).toBe(true);
    expect(payload.smtpConfig?.hasPassword).toBe(true);
    expect(payload.reports[0]?.versions[0]?.markdown).toBe("# Daily arXiv");
    expect(payload.favorites).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain("encrypted-api-key");
    expect(JSON.stringify(payload)).not.toContain("encrypted-smtp-password");
  });

  it("builds an admin export without leaking notification SMTP secrets", () => {
    const payload = buildAdminPortableExport({
      admin: {
        id: "admin-1",
        email: "admin@example.edu"
      },
      settings: {
        notificationFallbackEnabled: true,
        dailyEmailLimit: 10,
        emailRetryCount: 2,
        arxivMaxResultsPerCategory: 100,
        manualLlmCallsPerUserPerDay: 50,
        concurrentManualLlmCallsPerUser: 1,
        userRoleManualLlmCallsPerUserPerDay: null,
        userRoleConcurrentManualLlmCallsPerUser: null,
        adminRoleManualLlmCallsPerUserPerDay: 100,
        adminRoleConcurrentManualLlmCallsPerUser: 2,
        logRetentionDays: 30,
        pdfTextRetentionDays: 30,
        backupRetentionDays: 7,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      notificationSmtp: {
        enabled: true,
        host: "smtp.example.edu",
        port: 465,
        secure: true,
        from: "Daily arXiv <admin@example.edu>",
        username: "admin",
        encryptedPassword: "encrypted-admin-smtp-password",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z")
      },
      allowedEmailDomains: [
        {
          id: "domain-1",
          domain: "example.edu",
          enabled: true,
          createdAt: new Date("2026-06-01T00:00:00.000Z")
        }
      ],
      users: [
        {
          id: "user-1",
          name: "Ada",
          email: "ada@example.edu",
          role: "user",
          emailVerified: true,
          disabled: false,
          notificationDisabled: false,
          manualLlmCallsPerUserPerDayOverride: 12,
          concurrentManualLlmCallsPerUserOverride: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-02T00:00:00.000Z")
        }
      ]
    }, exportedAt);

    expect(payload.version).toBe("daily-arxiv-admin-export-v1");
    expect(payload.notificationSmtp?.hasPassword).toBe(true);
    expect(payload.allowedEmailDomains[0]?.domain).toBe("example.edu");
    expect(payload.users[0]?.manualLlmCallsPerUserPerDayOverride).toBe(12);
    expect(JSON.stringify(payload)).not.toContain("encrypted-admin-smtp-password");
  });

  it("returns a JSON attachment response", async () => {
    const response = jsonExportResponse({ ok: true }, "daily-arxiv-export.json");

    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="daily-arxiv-export.json"');
    expect(await response.json()).toEqual({ ok: true });
  });

  it("builds a user import plan for portable preference and reading states only", () => {
    const plan = buildUserPortableImportPlan({
      version: "daily-arxiv-user-export-v1",
      preference: {
        categories: ["cs.AI", 123],
        categoryWeights: { "cs.AI": 2, bad: "nope" },
        includeKeywords: ["agent"],
        excludeKeywords: ["survey"],
        topN: 8,
        sendTime: "08:30",
        timezone: "UTC",
        summaryFocus: "methods"
      },
      readingStates: [
        {
          paperId: " 2501.00001 ",
          favorited: true,
          read: true,
          ignored: false,
          recommendedAt: "2026-06-18T00:00:00.000Z"
        },
        {
          paperId: "2501.00001",
          favorited: false,
          read: true,
          ignored: true,
          recommendedAt: "bad-date"
        },
        { paperId: "", favorited: true }
      ],
      llmConfig: { encryptedApiKey: "should-not-import" },
      smtpConfig: { encryptedPassword: "should-not-import" },
      reports: [{ markdown: "# report" }],
      favorites: [{ paperId: "2501.00001" }]
    });

    expect(plan.preference).toMatchObject({
      categories: ["cs.AI"],
      categoryWeights: { "cs.AI": 2 },
      includeKeywords: ["agent"],
      topN: 8
    });
    expect(plan.readingStates).toEqual([
      {
        paperId: "2501.00001",
        favorited: false,
        read: true,
        ignored: true,
        recommendedAt: null
      }
    ]);
    expect(plan.ignoredSections).toEqual(["llmConfig", "smtpConfig", "reports", "favorites"]);
    expect(JSON.stringify(plan)).not.toContain("should-not-import");
  });

  it("rejects unsupported import JSON versions", () => {
    expect(() => buildUserPortableImportPlan({ version: "daily-arxiv-admin-export-v1" })).toThrow("Unsupported user export JSON");
  });

  it("builds an admin import plan without importing users or SMTP secrets", () => {
    const plan = buildAdminPortableImportPlan({
      version: "daily-arxiv-admin-export-v1",
      settings: {
        notificationFallbackEnabled: true,
        dailyEmailLimit: 20,
        emailRetryCount: 3,
        arxivMaxResultsPerCategory: 80,
        manualLlmCallsPerUserPerDay: 40,
        concurrentManualLlmCallsPerUser: 2,
        userRoleManualLlmCallsPerUserPerDay: 12,
        userRoleConcurrentManualLlmCallsPerUser: "",
        adminRoleManualLlmCallsPerUserPerDay: null,
        adminRoleConcurrentManualLlmCallsPerUser: 4,
        logRetentionDays: 60,
        pdfTextRetentionDays: 30,
        backupRetentionDays: 14
      },
      notificationSmtp: { encryptedPassword: "secret" },
      allowedEmailDomains: [
        { domain: " Example.edu ", enabled: true },
        { domain: "bad_domain.edu", enabled: true },
        { domain: "example.edu", enabled: false }
      ],
      users: [
        {
          email: "Ada@Example.edu",
          role: "admin",
          disabled: true,
          notificationDisabled: true,
          manualLlmCallsPerUserPerDayOverride: 9,
          concurrentManualLlmCallsPerUserOverride: "2"
        },
        { email: "not-an-email", notificationDisabled: true }
      ]
    });

    expect(plan.settings).toMatchObject({
      notificationFallbackEnabled: true,
      dailyEmailLimit: 20,
      userRoleManualLlmCallsPerUserPerDay: 12,
      userRoleConcurrentManualLlmCallsPerUser: null
    });
    expect(plan.allowedEmailDomains).toEqual([{ domain: "example.edu", enabled: false }]);
    expect(plan.users).toEqual([
      {
        email: "ada@example.edu",
        notificationDisabled: true,
        manualLlmCallsPerUserPerDayOverride: 9,
        concurrentManualLlmCallsPerUserOverride: 2
      }
    ]);
    expect(plan.ignoredSections).toEqual(["notificationSmtp"]);
    expect(JSON.stringify(plan)).not.toContain("secret");
    expect(JSON.stringify(plan)).not.toContain("\"role\"");
    expect(JSON.stringify(plan)).not.toContain("\"disabled\":true");
  });

  it("rejects unsupported admin import JSON versions", () => {
    expect(() => buildAdminPortableImportPlan({ version: "daily-arxiv-user-export-v1" })).toThrow("Unsupported admin export JSON");
  });
});
