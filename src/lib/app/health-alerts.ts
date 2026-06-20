import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { buildHealthAlertDigest, buildHealthAlertWebhookPayload, type HealthAlertDigest } from "@/lib/app/health-alert-summary";
import { getSystemHealth } from "@/lib/app/health";
import { sendAdminAlertEmail } from "@/lib/app/notifications";
import { recordQueueHealthSnapshot } from "@/lib/app/queue-health-log";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";

export const HEALTH_ALERT_LOG_TYPE = "health-alert";
export const DEFAULT_HEALTH_ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000;

function alertThrottleMs() {
  const parsed = Number(process.env.HEALTH_ALERT_THROTTLE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_HEALTH_ALERT_THROTTLE_MS;
}

export async function sendHealthAlertWebhook(digest: HealthAlertDigest, now = new Date()) {
  const url = process.env.HEALTH_ALERT_WEBHOOK_URL?.trim();
  if (!url) return { sent: false, reason: "webhook_not_configured" as const };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildHealthAlertWebhookPayload(digest, now))
    });

    if (!response.ok) {
      return { sent: false, reason: "webhook_failed" as const, status: response.status };
    }
    return { sent: true, reason: "sent" as const, status: response.status };
  } catch (error) {
    return {
      sent: false,
      reason: "webhook_failed" as const,
      error: error instanceof Error ? error.message : "unknown webhook error"
    };
  }
}

async function hasRecentAlert(fingerprintValue: string, now = new Date()) {
  const since = new Date(now.getTime() - alertThrottleMs());
  const rows = await db.query.jobLog.findMany({
    where: eq(jobLog.type, HEALTH_ALERT_LOG_TYPE),
    orderBy: desc(jobLog.createdAt),
    limit: 20
  });
  return rows.some((row) => row.createdAt >= since && row.metadata?.fingerprint === fingerprintValue);
}

export async function sendHealthAlertIfNeeded(now = new Date()) {
  const health = await getSystemHealth();
  await recordQueueHealthSnapshot(health.queues, now).catch((error) => {
    console.error("daily-arxiv queue health snapshot failed", error);
  });
  const digest = buildHealthAlertDigest(health, now);
  if (!digest) return { sent: false, reason: "healthy" as const };

  if (await hasRecentAlert(digest.fingerprint, now)) {
    return { sent: false, reason: "deduped" as const, fingerprint: digest.fingerprint };
  }

  const [email, webhook] = await Promise.all([
    sendAdminAlertEmail({
      subject: digest.subject,
      text: digest.text
    }),
    sendHealthAlertWebhook(digest, now)
  ]);
  const sent = email.sent || webhook.sent;
  await db.insert(jobLog).values({
    id: randomUUID(),
    type: HEALTH_ALERT_LOG_TYPE,
    status: sent || (
      email.reason === "admin_smtp_not_configured"
      && webhook.reason === "webhook_not_configured"
    ) || (
      email.reason === "admin_recipient_missing"
      && webhook.reason === "webhook_not_configured"
    ) ? "succeeded" : "failed",
    message: sent
      ? `Sent health alert via${email.sent ? ` email(${email.sentCount})` : ""}${webhook.sent ? " webhook" : ""}`
      : `Health alert not sent: email ${email.reason}, webhook ${webhook.reason}`,
    metadata: {
      fingerprint: digest.fingerprint,
      items: digest.items,
      email,
      webhook
    }
  });

  return {
    sent,
    email,
    webhook,
    fingerprint: digest.fingerprint,
    itemCount: digest.items.length
  };
}
