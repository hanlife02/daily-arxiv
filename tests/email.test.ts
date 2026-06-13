import { describe, expect, it } from "vitest";
import { assertCanSendToRegisteredEmail, selectNotificationSmtp } from "@/lib/email/notification";

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
});
