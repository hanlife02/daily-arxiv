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
  if (!recipient.emailVerified) {
    throw new Error("Recipient email is not verified");
  }
  if (recipient.email.toLowerCase() !== requestedTo.toLowerCase()) {
    throw new Error("Notification recipient must be the verified registered email");
  }
}
