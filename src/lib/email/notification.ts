export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string | null;
  password?: string | null;
};

export type NotificationPolicy = {
  fallbackEnabled: boolean;
  dailyEmailLimit: number;
  retryCount: number;
};

export type VerifiedRecipient = {
  email: string;
  emailVerified: boolean;
};

export type RecipientValidationResult =
  | { ok: true }
  | { ok: false; reason: "email_not_verified" | "recipient_mismatch"; message: string };

export function selectNotificationSmtp(
  userConfig: SmtpConfig | null | undefined,
  adminFallback: SmtpConfig | null | undefined,
  policy: Pick<NotificationPolicy, "fallbackEnabled">
) {
  if (userConfig) return { provider: "user" as const, config: userConfig };
  if (policy.fallbackEnabled && adminFallback) return { provider: "admin_fallback" as const, config: adminFallback };
  return null;
}

export function assertCanSendToRegisteredEmail(recipient: VerifiedRecipient, requestedTo: string) {
  const result = validateRegisteredEmailRecipient(recipient, requestedTo);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export function validateRegisteredEmailRecipient(recipient: VerifiedRecipient, requestedTo: string): RecipientValidationResult {
  if (!recipient.emailVerified) {
    return {
      ok: false,
      reason: "email_not_verified",
      message: "Recipient email is not verified"
    };
  }
  if (recipient.email.toLowerCase() !== requestedTo.toLowerCase()) {
    return {
      ok: false,
      reason: "recipient_mismatch",
      message: "Notification recipient must be the verified registered email"
    };
  }
  return { ok: true };
}

export function emailAttemptCount(retryCount: number | null | undefined) {
  const retries = Number.isFinite(retryCount) ? Math.max(0, Math.floor(Number(retryCount))) : 0;
  return retries + 1;
}
