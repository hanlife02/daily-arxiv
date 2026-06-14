import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, adminSetting, emailLog, report, reportVersion, user, userSmtpConfig } from "@/lib/db/schema";
import { SYSTEM_SETTINGS_ID } from "@/lib/app/bootstrap";
import { assertCanSendToRegisteredEmail, selectNotificationSmtp, type SmtpConfig } from "@/lib/email/notification";
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

export async function sendLatestReportEmail(reportId: string) {
  const currentReport = await db.query.report.findFirst({
    where: eq(report.id, reportId)
  });
  if (!currentReport || currentReport.status !== "succeeded") return { sent: false, reason: "report_not_succeeded" as const };

  const owner = await db.query.user.findFirst({
    where: eq(user.id, currentReport.userId)
  });
  if (!owner || owner.notificationDisabled) return { sent: false, reason: "user_notification_disabled" as const };

  const version = await db.query.reportVersion.findFirst({
    where: and(eq(reportVersion.reportId, reportId), eq(reportVersion.version, currentReport.latestVersion))
  });
  if (!version?.markdown) return { sent: false, reason: "report_version_missing" as const };

  const settings = await db.query.adminSetting.findFirst({
    where: eq(adminSetting.id, SYSTEM_SETTINGS_ID)
  });
  const limit = settings?.dailyEmailLimit ?? 10;
  if (limit > 0 && (await countEmailsSentToday(owner.id)) >= limit) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject: `daily-arxiv 日报 ${currentReport.batchDate}`,
      provider: "none",
      status: "skipped_limit"
    });
    return { sent: false, reason: "daily_limit_reached" as const };
  }

  assertCanSendToRegisteredEmail(owner, owner.email);

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

  const subject = `daily-arxiv 日报 ${currentReport.batchDate}`;
  if (!selected) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject,
      provider: "none",
      status: "skipped_no_smtp"
    });
    return { sent: false, reason: "smtp_not_configured" as const };
  }

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
      status: "sent"
    });
    await db.update(report).set({ emailStatus: "sent", updatedAt: new Date() }).where(eq(report.id, reportId));
    return { sent: true, reason: "sent" as const };
  } catch (error) {
    await logEmail({
      userId: owner.id,
      recipient: owner.email,
      subject,
      provider: selected.provider,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown email error"
    });
    await db.update(report).set({ emailStatus: "failed", updatedAt: new Date() }).where(eq(report.id, reportId));
    return { sent: false, reason: "send_failed" as const };
  }
}
