import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { clampTopN } from "@/lib/settings/limits";
import { isEmailAllowed } from "@/lib/users/registration";

describe("settings and security", () => {
  it("encrypts fields without returning plaintext", () => {
    const encrypted = encryptSecret("secret-value", "test-key");
    expect(encrypted).not.toContain("secret-value");
    expect(decryptSecret(encrypted, "test-key")).toBe("secret-value");
  });

  it("clamps Top N by admin limit", () => {
    expect(clampTopN(50, 10)).toBe(10);
    expect(clampTopN(0, 10)).toBe(1);
  });

  it("enforces allowed email domains", () => {
    expect(isEmailAllowed("a@school.edu", ["school.edu"])).toBe(true);
    expect(isEmailAllowed("a@gmail.com", ["school.edu"])).toBe(false);
  });
});
