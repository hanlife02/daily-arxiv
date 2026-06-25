import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, adminSetting, emailLog, report, reportVersion, user, userSmtpConfig } from "@/lib/db/schema";
import { SYSTEM_SETTINGS_ID } from "@/lib/app/bootstrap";
import { emailAttemptCount, selectNotificationSmtp, validateRegisteredEmailRecipient, type SmtpConfig } from "@/lib/email/notification";
import { decryptSecret } from "@/lib/security/crypto";

function decryptSmtpConfig(row: typeof userSmtpConfig.$inferSelect | typeof adminNotificationSmtpConfig.$inferSelect): SmtpConfig {
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    from: row.from,
    username: row.username,
    password: row.encryptedPassword ? decryptSecret(row.encryptedPassword) : null
  };
}

async function countEmailsSentToday(userId: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.userId, userId), eq(emailLog.status, "sent"), gte(emailLog.createdAt, since)));
  return rows.length;
}

async function logEmail(input: {
  userId: string;
  recipient: string;
  subject: string;
  provider: string;
  status: string;
  error?: string;
}) {
  await db.insert(emailLog).values({
    id: randomUUID(),
    userId: input.userId,
    recipient: input.recipient,
    subject: input.subject,
    provider: input.provider,
    status: input.status,
    error: input.error
  });
}

export async function sendAdminAlertEmail(input: { subject: string; text: string }) {
  const adminSmtp = await db.query.adminNotificationSmtpConfig.findFirst({
    where: eq(adminNotificationSmtpConfig.id, SYSTEM_SETTINGS_ID)
  });
  if (!adminSmtp?.enabled) {
    return { sent: false, reason: "admin_smtp_not_configured" as const, sentCount: 0, failedCount: 0 };
  }

  const admins = await db.query.user.findMany({
    where: and(eq(user.role, "admin"), eq(user.disabled, false), eq(user.emailVerified, true), eq(user.notificationDisabled, false))
  });
  if (admins.length === 0) {
    return { sent: false, reason: "admin_recipient_missing" as const, sentCount: 0, failedCount: 0 };
  }

  const config = decryptSmtpConfig(adminSmtp);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username
      ? {
          user: config.username,
          pass: config.password ?? undefined
        }
      : undefined
  });

  let sentCount = 0;
  let failedCount = 0;
  let lastError: string | undefined;
  for (const admin of admins) {
    try {
      await transporter.sendMail({
        from: config.from,
        to: admin.email,
        subject: input.subject,
        text: input.text
      });
      sentCount += 1;
      await logEmail({
        userId: admin.id,
        recipient: admin.email,
        subject: input.subject,
        provider: "admin_alert",
        status: "sent"
      });
    } catch (error) {
      failedCount += 1;
      lastError = error instanceof Error ? error.message : "Unknown email error";
      await logEmail({
        userId: admin.id,
        recipient: admin.email,
        subject: input.subject,
        provider: "admin_alert",
        status: "failed",
        error: lastError
      });
    }
  }

  if (sentCount > 0) return { sent: true, reason: "sent" as const, sentCount, failedCount };
  return { sent: false, reason: "send_failed" as const, sentCount, failedCount, error: lastError };
}

async function updateReportEmailStatus(reportId: string, emailStatus: string) {
  await db.update(report).set({ emailStatus, updatedAt: new Date() }).where(eq(report.id, reportId));
}

export async function sendLatestReportEmail(reportId: string) {
  const currentReport = await db.query.report.findFirst({
    where: eq(report.id, reportId)
  });
  if (!currentReport || !["succeeded", "partial_succeeded"].includes(currentReport.status)) return { sent: false, reason: "report_not_succeeded" as const };

  const owner = await db.query.user.findFirst({
    where: eq(user.id, currentReport.userId)
  });
  if (!owner) {
    await updateReportEmailStatus(reportId, "skipped_user_missing");
    return { sent: false, reason: "user_missing" as const };
  }
  if (owner.notificationDisabled) {
    await updateReportEmailStatus(reportId, "skipped_user_notification_disabled");
    return { sent: false, reason: "user_notification_disabled" as const };
  }

  const version = await db.query.reportVersion.findFirst({
    where: and(eq(reportVersion.reportId, reportId), eq(reportVersion.version, currentReport.latestVersion))
  });
  if (!version?.markdown) {
    await updateReportEmailStatus(reportId, "skipped_report_version_missing");
    return { sent: false, reason: "report_version_missing" as const };
  }

  const subject = `daily-arxiv 日报 ${currentReport.batchDate}`;
  const settings = await db.query.adminSetting.findFirst({
    where: eq(adminSetting.id, SYSTEM_SETTINGS_ID)
  });
  const limit = settings?.dailyEmailLimit ?? 10;
  if (limit > 0 && (await countEmailsSentToday(owner.id)) >= limit) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject,
      provider: "none",
      status: "skipped_limit"
    });
    await updateReportEmailStatus(reportId, "skipped_limit");
    return { sent: false, reason: "daily_limit_reached" as const };
  }

  const recipientValidation = validateRegisteredEmailRecipient(owner, owner.email);
  if (!recipientValidation.ok) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject,
      provider: "none",
      status: `skipped_${recipientValidation.reason}`,
      error: recipientValidation.message
    });
    await updateReportEmailStatus(reportId, `skipped_${recipientValidation.reason}`);
    return { sent: false, reason: recipientValidation.reason };
  }

  const userSmtp = await db.query.userSmtpConfig.findFirst({
    where: eq(userSmtpConfig.userId, owner.id)
  });
  const adminSmtp = await db.query.adminNotificationSmtpConfig.findFirst({
    where: eq(adminNotificationSmtpConfig.id, SYSTEM_SETTINGS_ID)
  });
  const selected = selectNotificationSmtp(
    userSmtp ? decryptSmtpConfig(userSmtp) : null,
    adminSmtp?.enabled ? decryptSmtpConfig(adminSmtp) : null,
    { fallbackEnabled: settings?.notificationFallbackEnabled ?? false }
  );

  if (!selected) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject,
      provider: "none",
      status: "skipped_no_smtp"
    });
    await updateReportEmailStatus(reportId, "skipped_no_smtp");
    return { sent: false, reason: "smtp_not_configured" as const };
  }

  const maxAttempts = emailAttemptCount(settings?.emailRetryCount);
  let lastError = "Unknown email error";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const transporter = nodemailer.createTransport({
        host: selected.config.host,
        port: selected.config.port,
        secure: selected.config.secure,
        auth: selected.config.username
          ? {
              user: selected.config.username,
              pass: selected.config.password ?? undefined
            }
          : undefined
      });
      await transporter.sendMail({
        from: selected.config.from,
        to: owner.email,
        subject,
        text: version.markdown
      });
      await logEmail({
        userId: owner.id,
        recipient: owner.email,
        subject,
        provider: selected.provider,
        status: "sent",
        error: attempt > 1 ? `sent_after_retry_${attempt}` : undefined
      });
      await db.update(report).set({ emailStatus: "sent", updatedAt: new Date() }).where(eq(report.id, reportId));
      return { sent: true, reason: "sent" as const };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown email error";
      if (attempt < maxAttempts) {
        await logEmail({
          userId: owner.id,
          recipient: owner.email,
          subject,
          provider: selected.provider,
          status: `retry_${attempt}`,
          error: lastError
        });
      }
    }
  }

  await logEmail({
    userId: owner.id,
    recipient: owner.email,
    subject,
    provider: selected.provider,
    status: "failed",
    error: lastError
  });
  await db.update(report).set({ emailStatus: "failed", updatedAt: new Date() }).where(eq(report.id, reportId));
  return { sent: false, reason: "send_failed" as const };
}
