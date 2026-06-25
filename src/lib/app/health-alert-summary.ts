import { createHash } from "node:crypto";

export type HealthAlertDigest = {
  fingerprint: string;
  subject: string;
  text: string;
  items: string[];
};

export type HealthAlertWebhookPayload = {
  service: "daily-arxiv";
  type: "health-alert";
  createdAt: string;
  fingerprint: string;
  subject: string;
  text: string;
  items: string[];
};

type HealthAlertInput = {
  checks: Record<string, { ok: boolean; message: string }>;
  queues: Array<{
    name: string;
    ok: boolean;
    message?: string;
    oldestFailedJob?: {
      name: string;
      failedReason?: string;
    };
    longRunningActiveJob?: {
      name: string;
      activeMs: number;
    };
    duplicateJobs?: Array<{
      name: string;
      count: number;
    }>;
  }>;
  jobFailures: Array<{
    type: string;
    terminalCount: number;
    failedCount: number;
    consecutiveFailures: number;
    alert: boolean;
    lastFailureCategory?: string;
    lastMessage?: string | null;
  }>;
};

function fingerprint(items: string[]) {
  return createHash("sha256").update(items.join("\n")).digest("hex").slice(0, 16);
}

function queueAlertItems(health: HealthAlertInput) {
  const items: string[] = [];
  for (const queue of health.queues) {
    if (!queue.ok) {
      items.push(`queue:${queue.name}: unavailable: ${queue.message ?? "unknown"}`);
    }
    if (queue.longRunningActiveJob) {
      items.push(`queue:${queue.name}: long-running ${queue.longRunningActiveJob.name} ${queue.longRunningActiveJob.activeMs}ms`);
    }
    if (queue.oldestFailedJob) {
      items.push(`queue:${queue.name}: oldest failed ${queue.oldestFailedJob.name}: ${queue.oldestFailedJob.failedReason ?? "unknown"}`);
    }
    for (const duplicate of queue.duplicateJobs ?? []) {
      items.push(`queue:${queue.name}: duplicate ${duplicate.name} x${duplicate.count}`);
    }
  }
  return items;
}

export function buildHealthAlertDigest(health: HealthAlertInput, now = new Date()): HealthAlertDigest | null {
  const items: string[] = [];
  for (const [name, check] of Object.entries(health.checks)) {
    if (!check.ok) {
      items.push(`check:${name}: ${check.message}`);
    }
  }
  for (const failure of health.jobFailures) {
    if (!failure.alert) continue;
    items.push(
      `job:${failure.type}: failed ${failure.failedCount}/${failure.terminalCount}, consecutive ${failure.consecutiveFailures}, category ${failure.lastFailureCategory ?? "unknown"}, last ${failure.lastMessage ?? "no message"}`
    );
  }
  items.push(...queueAlertItems(health));

  const uniqueItems = [...new Set(items)].sort();
  if (uniqueItems.length === 0) return null;

  const id = fingerprint(uniqueItems);
  const subject = `[daily-arxiv] 健康告警 ${uniqueItems.length} 项`;
  const text = [
    "daily-arxiv 健康告警",
    "",
    `时间：${now.toISOString()}`,
    `指纹：${id}`,
    "",
    ...uniqueItems.map((item) => `- ${item}`),
    "",
    "请进入管理员后台查看系统健康、队列、任务日志和最近备份。"
  ].join("\n");

  return {
    fingerprint: id,
    subject,
    text,
    items: uniqueItems
  };
}

export function buildHealthAlertWebhookPayload(digest: HealthAlertDigest, now = new Date()): HealthAlertWebhookPayload {
  return {
    service: "daily-arxiv",
    type: "health-alert",
    createdAt: now.toISOString(),
    fingerprint: digest.fingerprint,
    subject: digest.subject,
    text: digest.text,
    items: digest.items
  };
}
