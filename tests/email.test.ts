import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  reportFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  reportVersionFindFirst: vi.fn(),
  adminSettingFindFirst: vi.fn(),
  userSmtpFindFirst: vi.fn(),
  adminSmtpFindFirst: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  decryptSecret: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      report: { findFirst: emailMocks.reportFindFirst },
      user: { findFirst: emailMocks.userFindFirst },
      reportVersion: { findFirst: emailMocks.reportVersionFindFirst },
      adminSetting: { findFirst: emailMocks.adminSettingFindFirst },
      userSmtpConfig: { findFirst: emailMocks.userSmtpFindFirst },
      adminNotificationSmtpConfig: { findFirst: emailMocks.adminSmtpFindFirst }
    },
    select: emailMocks.select,
    insert: emailMocks.insert,
    update: emailMocks.update
  }
}));

vi.mock("@/lib/security/crypto", () => ({
  decryptSecret: emailMocks.decryptSecret
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: emailMocks.createTransport
  },
  createTransport: emailMocks.createTransport
}));

import {
  assertCanSendToRegisteredEmail,
  emailAttemptCount,
  selectNotificationSmtp,
  validateRegisteredEmailRecipient
} from "@/lib/email/notification";
import { getAuthSmtpConfig, hasAuthSmtpConfig } from "@/lib/email/auth";
import { hasSmtpConfigIntent, normalizeSmtpConfig, normalizeSmtpHost, normalizeSmtpPort } from "@/lib/email/smtp-config";
import { sendLatestReportEmail } from "@/lib/app/notifications";

const smtp = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  from: "Daily arXiv <noreply@example.com>"
};

describe("notification email rules", () => {
  it("prefers user SMTP over admin fallback", () => {
    const selected = selectNotificationSmtp(smtp, { ...smtp, host: "fallback.example.com" }, { fallbackEnabled: true });
    expect(selected?.provider).toBe("user");
    expect(selected?.config.host).toBe("smtp.example.com");
  });

  it("uses admin fallback only when enabled", () => {
    expect(selectNotificationSmtp(null, smtp, { fallbackEnabled: false })).toBeNull();
    expect(selectNotificationSmtp(null, smtp, { fallbackEnabled: true })?.provider).toBe("admin_fallback");
  });

  it("restricts recipient to verified registered email", () => {
    expect(() => assertCanSendToRegisteredEmail({ email: "me@example.com", emailVerified: true }, "other@example.com")).toThrow();
    expect(() => assertCanSendToRegisteredEmail({ email: "me@example.com", emailVerified: false }, "me@example.com")).toThrow();
    expect(() => assertCanSendToRegisteredEmail({ email: "me@example.com", emailVerified: true }, "me@example.com")).not.toThrow();
  });

  it("returns recipient validation reasons without throwing", () => {
    expect(validateRegisteredEmailRecipient({ email: "me@example.com", emailVerified: false }, "me@example.com")).toMatchObject({
      ok: false,
      reason: "email_not_verified"
    });
    expect(validateRegisteredEmailRecipient({ email: "me@example.com", emailVerified: true }, "other@example.com")).toMatchObject({
      ok: false,
      reason: "recipient_mismatch"
    });
    expect(validateRegisteredEmailRecipient({ email: "me@example.com", emailVerified: true }, "ME@example.com")).toEqual({ ok: true });
  });

  it("converts retry policy to total send attempts", () => {
    expect(emailAttemptCount(0)).toBe(1);
    expect(emailAttemptCount(2)).toBe(3);
    expect(emailAttemptCount(-1)).toBe(1);
  });
});

describe("SMTP config validation", () => {
  it("normalizes Auth SMTP environment config", () => {
    expect(
      getAuthSmtpConfig({
        SMTP_HOST: " smtp.example.com ",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_FROM: " Daily arXiv <noreply@example.com> ",
        SMTP_USER: " auth-user ",
        SMTP_PASSWORD: "secret"
      })
    ).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "Daily arXiv <noreply@example.com>",
      username: "auth-user",
      password: "secret"
    });
  });

  it("treats missing or invalid Auth SMTP environment config as unavailable", () => {
    expect(hasAuthSmtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587" })).toBe(false);
    expect(hasAuthSmtpConfig({ SMTP_HOST: "https://smtp.example.com", SMTP_PORT: "587", SMTP_FROM: "noreply@example.com" })).toBe(false);
    expect(hasAuthSmtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "0", SMTP_FROM: "noreply@example.com" })).toBe(false);
    expect(hasAuthSmtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_FROM: "noreply@example.com" })).toBe(true);
  });

  it("normalizes valid SMTP config fields", () => {
    expect(
      normalizeSmtpConfig({
        host: " smtp.example.com ",
        port: 587,
        secure: false,
        from: " Daily arXiv <noreply@example.com> ",
        username: " user@example.com ",
        password: "secret"
      })
    ).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      from: "Daily arXiv <noreply@example.com>",
      username: "user@example.com",
      password: "secret"
    });
  });

  it("rejects SMTP host values with protocol or paths", () => {
    expect(() => normalizeSmtpHost("https://smtp.example.com")).toThrow();
    expect(() => normalizeSmtpHost("smtp.example.com/mail")).toThrow();
    expect(() => normalizeSmtpHost("smtp example.com")).toThrow();
  });

  it("requires SMTP port to be an integer in range", () => {
    expect(normalizeSmtpPort(465)).toBe(465);
    expect(() => normalizeSmtpPort(0)).toThrow();
    expect(() => normalizeSmtpPort(65536)).toThrow();
    expect(() => normalizeSmtpPort(587.5)).toThrow();
  });

  it("detects whether an optional SMTP form should persist a config", () => {
    expect(hasSmtpConfigIntent({ enabled: false, host: "", from: "", username: "", password: "" })).toBe(false);
    expect(hasSmtpConfigIntent({ enabled: true, host: "", from: "", username: "", password: "" })).toBe(true);
    expect(hasSmtpConfigIntent({ enabled: false, host: "smtp.example.com", from: "", username: "", password: "" })).toBe(true);
    expect(hasSmtpConfigIntent({ enabled: false, host: "", from: "Daily arXiv <noreply@example.com>" })).toBe(true);
  });
});

const baseReport = {
  id: "report-1",
  userId: "user-1",
  status: "succeeded",
  latestVersion: 1,
  batchDate: "2026-06-20"
};

const baseOwner = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: true,
  disabled: false,
  notificationDisabled: false
};

const baseVersion = {
  reportId: "report-1",
  version: 1,
  markdown: "# Daily report"
};

const baseSettings = {
  id: "system",
  notificationFallbackEnabled: false,
  dailyEmailLimit: 10,
  emailRetryCount: 0
};

const userSmtpRow = {
  host: "smtp.user.example",
  port: 587,
  secure: false,
  from: "User SMTP <user-smtp@example.com>",
  username: "user-smtp",
  encryptedPassword: "encrypted-user-password"
};

const adminSmtpRow = {
  enabled: true,
  host: "smtp.admin.example",
  port: 465,
  secure: true,
  from: "Admin SMTP <admin-smtp@example.com>",
  username: "admin-smtp",
  encryptedPassword: "encrypted-admin-password"
};

function configureEmailDb(input: {
  settings?: typeof baseSettings;
  userSmtp?: typeof userSmtpRow | null;
  adminSmtp?: typeof adminSmtpRow | null;
  sentToday?: number;
}) {
  emailMocks.reportFindFirst.mockResolvedValue({ ...baseReport });
  emailMocks.userFindFirst.mockResolvedValue({ ...baseOwner });
  emailMocks.reportVersionFindFirst.mockResolvedValue({ ...baseVersion });
  emailMocks.adminSettingFindFirst.mockResolvedValue(input.settings ?? { ...baseSettings });
  emailMocks.userSmtpFindFirst.mockResolvedValue(input.userSmtp ?? null);
  emailMocks.adminSmtpFindFirst.mockResolvedValue(input.adminSmtp ?? null);
  emailMocks.selectWhere.mockResolvedValue(Array.from({ length: input.sentToday ?? 0 }, (_, index) => ({ id: `email-${index + 1}` })));
}

describe("latest report email sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMocks.select.mockReturnValue({ from: emailMocks.selectFrom });
    emailMocks.selectFrom.mockReturnValue({ where: emailMocks.selectWhere });
    emailMocks.insert.mockReturnValue({ values: emailMocks.insertValues });
    emailMocks.insertValues.mockResolvedValue(undefined);
    emailMocks.update.mockReturnValue({ set: emailMocks.updateSet });
    emailMocks.updateSet.mockReturnValue({ where: emailMocks.updateWhere });
    emailMocks.updateWhere.mockResolvedValue(undefined);
    emailMocks.createTransport.mockReturnValue({ sendMail: emailMocks.sendMail });
    emailMocks.sendMail.mockResolvedValue({ accepted: ["user@example.com"] });
    emailMocks.decryptSecret.mockImplementation((value) => `decrypted:${value}`);
  });

  it("fails with user SMTP and records the failed provider without falling back", async () => {
    configureEmailDb({
      settings: { ...baseSettings, notificationFallbackEnabled: true, emailRetryCount: 0 },
      userSmtp: userSmtpRow,
      adminSmtp: adminSmtpRow
    });
    emailMocks.sendMail.mockRejectedValue(new Error("user smtp down"));

    const result = await sendLatestReportEmail("report-1");

    expect(result).toEqual({ sent: false, reason: "send_failed" });
    expect(emailMocks.createTransport).toHaveBeenCalledTimes(1);
    expect(emailMocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.user.example",
      port: 587,
      secure: false,
      auth: {
        user: "user-smtp",
        pass: "decrypted:encrypted-user-password"
      }
    });
    expect(emailMocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      provider: "user",
      status: "failed",
      error: "user smtp down"
    }));
    expect(emailMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      emailStatus: "failed"
    }));
  });

  it("does not use admin fallback SMTP when fallback is disabled", async () => {
    configureEmailDb({
      settings: { ...baseSettings, notificationFallbackEnabled: false },
      userSmtp: null,
      adminSmtp: adminSmtpRow
    });

    const result = await sendLatestReportEmail("report-1");

    expect(result).toEqual({ sent: false, reason: "smtp_not_configured" });
    expect(emailMocks.createTransport).not.toHaveBeenCalled();
    expect(emailMocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      provider: "none",
      status: "skipped_no_smtp"
    }));
    expect(emailMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      emailStatus: "skipped_no_smtp"
    }));
  });

  it("sends through admin fallback SMTP when fallback is enabled", async () => {
    configureEmailDb({
      settings: { ...baseSettings, notificationFallbackEnabled: true },
      userSmtp: null,
      adminSmtp: adminSmtpRow
    });

    const result = await sendLatestReportEmail("report-1");

    expect(result).toEqual({ sent: true, reason: "sent" });
    expect(emailMocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.admin.example",
      port: 465,
      secure: true,
      auth: {
        user: "admin-smtp",
        pass: "decrypted:encrypted-admin-password"
      }
    });
    expect(emailMocks.sendMail).toHaveBeenCalledWith({
      from: "Admin SMTP <admin-smtp@example.com>",
      to: "user@example.com",
      subject: "daily-arxiv 日报 2026-06-20",
      text: "# Daily report"
    });
    expect(emailMocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      provider: "admin_fallback",
      status: "sent"
    }));
    expect(emailMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      emailStatus: "sent"
    }));
  });

  it("skips sending when the daily email limit has been reached", async () => {
    configureEmailDb({
      settings: { ...baseSettings, dailyEmailLimit: 1 },
      userSmtp: userSmtpRow,
      sentToday: 1
    });

    const result = await sendLatestReportEmail("report-1");

    expect(result).toEqual({ sent: false, reason: "daily_limit_reached" });
    expect(emailMocks.userSmtpFindFirst).not.toHaveBeenCalled();
    expect(emailMocks.createTransport).not.toHaveBeenCalled();
    expect(emailMocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      provider: "none",
      status: "skipped_limit"
    }));
    expect(emailMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      emailStatus: "skipped_limit"
    }));
  });

  it("retries failed sends according to the configured retry count", async () => {
    configureEmailDb({
      settings: { ...baseSettings, emailRetryCount: 2 },
      userSmtp: userSmtpRow
    });
    emailMocks.sendMail
      .mockRejectedValueOnce(new Error("temporary smtp failure 1"))
      .mockRejectedValueOnce(new Error("temporary smtp failure 2"))
      .mockResolvedValueOnce({ accepted: ["user@example.com"] });

    const result = await sendLatestReportEmail("report-1");

    expect(result).toEqual({ sent: true, reason: "sent" });
    expect(emailMocks.createTransport).toHaveBeenCalledTimes(3);
    expect(emailMocks.sendMail).toHaveBeenCalledTimes(3);
    expect(emailMocks.insertValues).toHaveBeenNthCalledWith(1, expect.objectContaining({
      provider: "user",
      status: "retry_1",
      error: "temporary smtp failure 1"
    }));
    expect(emailMocks.insertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      provider: "user",
      status: "retry_2",
      error: "temporary smtp failure 2"
    }));
    expect(emailMocks.insertValues).toHaveBeenNthCalledWith(3, expect.objectContaining({
      provider: "user",
      status: "sent",
      error: "sent_after_retry_3"
    }));
    expect(emailMocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      emailStatus: "sent"
    }));
  });
});
