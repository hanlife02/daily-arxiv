import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/app/authz";
import { getAdminSettings } from "@/lib/app/settings";
import { listBackupFiles } from "@/lib/app/backups";
import { getDataLifecycleSummary } from "@/lib/app/data-lifecycle";
import { getSystemHealth } from "@/lib/app/health";
import { INCIDENT_HISTORY_LOG_TYPE, summarizeIncidentHistoryLog } from "@/lib/app/incident-history";
import { summarizeOperationalIncidents, type OperationalIncidentSeverity } from "@/lib/app/incident-summary";
import { classifyJobFailureReason } from "@/lib/app/job-health";
import { buildJobLogPagination, jobLogPageHref, parseJobLogBrowserFilters } from "@/lib/app/job-log-browser";
import { buildLogTimeline, extractLogCorrelationKeys, hasLogCorrelationKeys, summarizeLogRootCause, type LogCorrelationKeys } from "@/lib/app/log-correlation";
import { getLlmUsageSummary } from "@/lib/app/llm-usage";
import { QUEUE_HEALTH_LOG_TYPE, summarizeQueueHealthTrend } from "@/lib/app/queue-health-log";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, allowedEmailDomain, emailLog, jobLog, llmCallLog, paper, paperMetric, report, user } from "@/lib/db/schema";
import { emailStatusLabel, jobFailureReasonLabel, jobStatusLabel, llmStatusLabel } from "@/lib/reports/status-labels";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
    job?: string;
    jobStatus?: string;
    jobType?: string;
    jobPage?: string;
    imported?: string;
    skippedUsers?: string;
    overwriteDomains?: string;
    createDomains?: string;
    updateUsers?: string;
    settingsFields?: string;
    changedDomains?: string;
    changedUsers?: string;
  }>;
};

const JOB_LOG_STATUS_OPTIONS = ["queued", "started", "succeeded", "failed", "delayed", "stalled"] as const;
const JOB_LOG_TYPE_OPTIONS = [
  "arxiv-crawl",
  "report-generation",
  "email-notification",
  "backup",
  "data-retention",
  "health-alert"
] as const;

async function countRows(table: typeof user | typeof paper | typeof report) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  return row?.count ?? 0;
}

function adminImportDetailLabel(input: {
  skippedUsers?: string;
  overwriteDomains?: string;
  createDomains?: string;
  updateUsers?: string;
  settingsFields?: string;
  changedDomains?: string;
  changedUsers?: string;
}) {
  const skippedUsers = Number(input.skippedUsers);
  const overwriteDomains = Number(input.overwriteDomains);
  const createDomains = Number(input.createDomains);
  const updateUsers = Number(input.updateUsers);
  const changedDomains = Number(input.changedDomains);
  const changedUsers = Number(input.changedUsers);
  const details = [
    input.settingsFields ? `系统设置字段：${input.settingsFields}` : "",
    Number.isFinite(overwriteDomains) && overwriteDomains > 0
      ? `覆盖 ${overwriteDomains} 个注册后缀${Number.isFinite(changedDomains) ? `，其中 ${changedDomains} 个会变化` : ""}`
      : "",
    Number.isFinite(createDomains) && createDomains > 0 ? `新增 ${createDomains} 个注册后缀` : "",
    Number.isFinite(updateUsers) && updateUsers > 0
      ? `更新 ${updateUsers} 个已有用户状态${Number.isFinite(changedUsers) ? `，其中 ${changedUsers} 个会变化` : ""}`
      : "",
    Number.isFinite(skippedUsers) && skippedUsers > 0 ? `跳过 ${skippedUsers} 个当前实例中不存在的用户` : ""
  ].filter(Boolean);
  return details.length ? `（${details.join("，")}）` : "";
}

function adminSavedLabel(
  saved?: string,
  imported?: string,
  input: {
    skippedUsers?: string;
    overwriteDomains?: string;
    createDomains?: string;
    updateUsers?: string;
    settingsFields?: string;
    changedDomains?: string;
    changedUsers?: string;
  } = {}
) {
  if (saved === "settings") return "通知策略已保存。";
  if (saved === "domain") return "注册邮箱后缀已更新。";
  if (saved === "user") return "用户状态已更新。";
  if (saved === "import-preview") {
    return `系统配置导入预览：将导入 ${imported || "可导入数据"}${adminImportDetailLabel(input)}。`;
  }
  if (saved === "import") {
    return `系统配置导入完成：${imported || "已处理可导入数据"}${adminImportDetailLabel(input)}。`;
  }
  return "";
}

function AdminNotice({
  saved,
  error,
  job,
  imported,
  skippedUsers,
  overwriteDomains,
  createDomains,
  updateUsers,
  settingsFields,
  changedDomains,
  changedUsers
}: {
  saved?: string;
  error?: string;
  job?: string;
  imported?: string;
  skippedUsers?: string;
  overwriteDomains?: string;
  createDomains?: string;
  updateUsers?: string;
  settingsFields?: string;
  changedDomains?: string;
  changedUsers?: string;
}) {
  const savedLabel = adminSavedLabel(saved, imported, {
    skippedUsers,
    overwriteDomains,
    createDomains,
    updateUsers,
    settingsFields,
    changedDomains,
    changedUsers
  });
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
        操作失败：{error.slice(0, 200)}
      </div>
    );
  }
  if (job) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/45 px-4 py-3 text-sm text-foreground">
        任务已提交：{job}
      </div>
    );
  }
  if (savedLabel) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/45 px-4 py-3 text-sm text-foreground">
        {savedLabel}
      </div>
    );
  }
  return null;
}

function formatDurationMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatCompactNumber(value: number) {
  if (value < 1000) return String(value);
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUsd(value: number) {
  if (value <= 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
}

function incidentSeverityLabel(severity: OperationalIncidentSeverity) {
  if (severity === "critical") return "严重";
  if (severity === "warning") return "关注";
  return "提示";
}

function incidentSeverityClassName(severity: OperationalIncidentSeverity) {
  if (severity === "critical") return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300";
  if (severity === "warning") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  return "border-border/60 bg-muted/35 text-muted-foreground";
}

function collectCorrelationKeys(items: LogCorrelationKeys[]) {
  return {
    userIds: [...new Set(items.flatMap((item) => item.userIds))],
    reportIds: [...new Set(items.flatMap((item) => item.reportIds))],
    paperIds: [...new Set(items.flatMap((item) => item.paperIds))]
  };
}

function buildLlmCorrelationWhere(keys: LogCorrelationKeys) {
  return or(
    keys.userIds.length > 0 ? inArray(llmCallLog.userId, keys.userIds) : undefined,
    keys.reportIds.length > 0 ? inArray(llmCallLog.reportId, keys.reportIds) : undefined,
    keys.paperIds.length > 0 ? inArray(llmCallLog.paperId, keys.paperIds) : undefined
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const currentAdmin = await requireAdmin();
  const params = await searchParams;
  const jobLogFilters = parseJobLogBrowserFilters(params ?? {});
  const jobLogWhere = and(
    ne(jobLog.type, QUEUE_HEALTH_LOG_TYPE),
    jobLogFilters.status ? eq(jobLog.status, jobLogFilters.status) : undefined,
    jobLogFilters.type ? eq(jobLog.type, jobLogFilters.type) : undefined
  );
  const [jobLogTotalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(jobLog).where(jobLogWhere);
  const jobLogPagination = buildJobLogPagination(jobLogTotalRow?.count ?? 0, jobLogFilters.page, jobLogFilters.pageSize);
  const [settings, health, llmUsage, dataLifecycle, smtp, domains, jobs, incidentLogs, queueHealthLogs, emails, llmLogs, users, userCount, paperCount, reportCount, s2MissingCount] = await Promise.all([
    getAdminSettings(),
    getSystemHealth(),
    getLlmUsageSummary(),
    getDataLifecycleSummary(),
    db.query.adminNotificationSmtpConfig.findFirst({ where: eq(adminNotificationSmtpConfig.id, "system") }),
    db.query.allowedEmailDomain.findMany({ orderBy: allowedEmailDomain.domain }),
    db.query.jobLog.findMany({
      where: jobLogWhere,
      orderBy: desc(jobLog.createdAt),
      limit: jobLogPagination.pageSize,
      offset: (jobLogPagination.page - 1) * jobLogPagination.pageSize
    }),
    db.query.jobLog.findMany({ where: eq(jobLog.type, INCIDENT_HISTORY_LOG_TYPE), orderBy: desc(jobLog.createdAt), limit: 5 }),
    db.query.jobLog.findMany({ where: eq(jobLog.type, QUEUE_HEALTH_LOG_TYPE), orderBy: desc(jobLog.createdAt), limit: 12 }),
    db.query.emailLog.findMany({ orderBy: desc(emailLog.createdAt), limit: 6 }),
    db.query.llmCallLog.findMany({ orderBy: desc(llmCallLog.createdAt), limit: 6 }),
    db.query.user.findMany({ orderBy: desc(user.createdAt), limit: 20 }),
    countRows(user),
    countRows(paper),
    countRows(report),
    db.select({ count: sql<number>`count(*)::int` }).from(paperMetric).where(eq(paperMetric.s2Status, "missing")).then(([row]) => row?.count ?? 0)
  ]);
  const backups = listBackupFiles(6);
  const queueHealthTrend = summarizeQueueHealthTrend(queueHealthLogs);
  const queueTrendMaxBacklog = Math.max(1, queueHealthTrend.maxBacklog);
  const llmTrendMaxCalls = Math.max(1, ...llmUsage.trend.map((point) => point.calls));
  const operationalIncidents = summarizeOperationalIncidents({
    healthChecks: health.checks,
    jobFailures: health.jobFailures,
    queueTrend: queueHealthTrend,
    llmFailureDiagnostics: llmUsage.insights.failureDiagnostics
  });
  const incidentHistory = incidentLogs.map(summarizeIncidentHistoryLog);
  const jobCorrelationKeys = new Map(jobs.map((log) => [log.id, extractLogCorrelationKeys(log.metadata)]));
  const allCorrelationKeys = collectCorrelationKeys([...jobCorrelationKeys.values()]);
  const [relatedEmails, relatedLlmCalls] = await Promise.all([
    allCorrelationKeys.userIds.length > 0
      ? db.query.emailLog.findMany({
        where: inArray(emailLog.userId, allCorrelationKeys.userIds),
        orderBy: desc(emailLog.createdAt),
        limit: 40
      })
      : Promise.resolve([]),
    hasLogCorrelationKeys(allCorrelationKeys)
      ? db.query.llmCallLog.findMany({
        where: buildLlmCorrelationWhere(allCorrelationKeys),
        orderBy: desc(llmCallLog.createdAt),
        limit: 40
      })
      : Promise.resolve([])
  ]);

  const checks = [
    ["公开健康检查", "/api/health"],
    ["PostgreSQL", health.checks.postgres?.ok ? "正常" : health.checks.postgres?.message ?? "未知"],
    ["Redis", health.checks.redis?.ok ? "正常" : health.checks.redis?.message ?? "未知"],
    ["Worker", health.checks.worker?.ok ? health.checks.worker.message : health.checks.worker?.message ?? "未知"],
    ["Scheduler", health.checks.scheduler?.ok ? health.checks.scheduler.message : health.checks.scheduler?.message ?? "未知"],
    ["队列", health.checks.queues?.ok ? health.checks.queues.message : health.checks.queues?.message ?? "未知"],
    ["任务失败", health.checks.jobs?.ok ? health.checks.jobs.message : health.checks.jobs?.message ?? "未知"],
    ["最近备份", health.checks.backup?.ok ? health.checks.backup.message : "暂无"],
    ["用户数", String(userCount)],
    ["论文数", String(paperCount)],
    ["日报数", String(reportCount)],
    ["S2 降级", `${s2MissingCount} 篇`],
    ["Notification SMTP", smtp?.enabled ? "已启用" : "未启用"],
    ["注册域名", `${domains.filter((domain) => domain.enabled).length} 个启用`]
  ];
  const relatedEmailsFor = (keys: LogCorrelationKeys) => relatedEmails
    .filter((log) => log.userId && keys.userIds.includes(log.userId))
    .slice(0, 3);
  const relatedLlmCallsFor = (keys: LogCorrelationKeys) => relatedLlmCalls
    .filter((log) =>
      (log.userId && keys.userIds.includes(log.userId)) ||
      (log.reportId && keys.reportIds.includes(log.reportId)) ||
      (log.paperId && keys.paperIds.includes(log.paperId))
    )
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理员后台</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理注册后缀、通知 fallback、限流、任务日志和健康状态。</p>
      </div>
      <AdminNotice
        saved={params?.saved}
        error={params?.error}
        job={params?.job}
        imported={params?.imported}
        skippedUsers={params?.skippedUsers}
        overwriteDomains={params?.overwriteDomains}
        createDomains={params?.createDomains}
        updateUsers={params?.updateUsers}
        settingsFields={params?.settingsFields}
        changedDomains={params?.changedDomains}
        changedUsers={params?.changedUsers}
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>系统健康</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {checks.map(([label, value]) => (
              <div key={label} className="neu-inset flex items-center justify-between rounded-xl px-4 py-2.5 text-sm">
                <span>{label}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ))}
            {health.scheduler.heartbeat?.summary ? (
              <div className="neu-inset rounded-xl px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>最近调度</span>
                  <span className="text-muted-foreground">
                    {health.scheduler.heartbeat.status === "succeeded" ? "成功" : health.scheduler.heartbeat.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  crawl {health.scheduler.heartbeat.summary.crawlQueued ? "queued" : "skip"} · reports {health.scheduler.heartbeat.summary.reportsQueued} · backup {health.scheduler.heartbeat.summary.backupQueued ? "queued" : "skip"} · retention {health.scheduler.heartbeat.summary.retentionQueued ? "queued" : "skip"}
                </p>
              </div>
            ) : null}
            <div className="mt-2 grid gap-2">
              {health.queues.map((queue) => (
                <div key={queue.name} className="neu-inset rounded-xl px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{queue.name}</span>
                    <span className="text-muted-foreground">{queue.ok ? "可读" : "异常"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {queue.ok
                      ? `waiting ${queue.counts?.waiting ?? 0} · active ${queue.counts?.active ?? 0} · delayed ${queue.counts?.delayed ?? 0} · failed ${queue.counts?.failed ?? 0}`
                      : queue.message}
                  </p>
                  {queue.oldestBacklogJob ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      最老待处理：{queue.oldestBacklogJob.state} · {queue.oldestBacklogJob.name}
                      {queue.oldestBacklogJob.id ? ` · ${queue.oldestBacklogJob.id}` : ""} · {formatDurationMs(queue.oldestBacklogJob.waitingMs)}
                      {queue.oldestBacklogJob.delayedUntil ? ` · 计划 ${new Date(queue.oldestBacklogJob.delayedUntil).toLocaleString("zh-CN")}` : ""}
                    </p>
                  ) : null}
                  {queue.longRunningActiveJob ? (
                    <p className="mt-1 break-all text-xs text-red-500">
                      长时间运行：{queue.longRunningActiveJob.name}
                      {queue.longRunningActiveJob.id ? ` · ${queue.longRunningActiveJob.id}` : ""} · {formatDurationMs(queue.longRunningActiveJob.activeMs)}
                    </p>
                  ) : null}
                  {queue.oldestFailedJob ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      最老失败：{queue.oldestFailedJob.name}
                      {queue.oldestFailedJob.id ? ` · ${queue.oldestFailedJob.id}` : ""} · {formatDurationMs(queue.oldestFailedJob.failedForMs)}
                      {queue.oldestFailedJob.failedReason ? ` · ${queue.oldestFailedJob.failedReason.slice(0, 120)}` : ""}
                    </p>
                  ) : null}
                  {queue.duplicateJobs && queue.duplicateJobs.length > 0 ? (
                    <p className="mt-1 break-all text-xs text-red-500">
                      疑似重复：{queue.duplicateJobs.map((item) => `${item.name} x${item.count}`).join(" / ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="neu-inset rounded-xl px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>队列积压趋势</span>
                <span className="text-muted-foreground">
                  {queueHealthTrend.latest ? new Date(queueHealthTrend.latest.observedAt).toLocaleString("zh-CN") : "暂无样本"}
                </span>
              </div>
              {queueHealthTrend.latest ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    当前积压 {queueHealthTrend.latest.totalBacklog} · 较上次 {queueHealthTrend.backlogDelta >= 0 ? "+" : ""}{queueHealthTrend.backlogDelta} · active {queueHealthTrend.latest.totalActive} · failed {queueHealthTrend.latest.totalFailed}
                  </p>
                  <div className="mt-3 flex h-12 items-end gap-1">
                    {queueHealthTrend.points.map((point) => (
                      <div
                        key={point.observedAt}
                        className={`w-full min-w-2 rounded-t ${point.totalFailed > 0 ? "bg-red-500/70" : "bg-primary/70"}`}
                        style={{ height: `${Math.max(10, Math.round((point.totalBacklog / queueTrendMaxBacklog) * 48))}px` }}
                        title={`${new Date(point.observedAt).toLocaleString("zh-CN")} · backlog ${point.totalBacklog} · failed ${point.totalFailed}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">scheduler 记录第一条队列健康快照后会显示趋势。</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>通知策略</CardTitle>
          </CardHeader>
          <CardContent as="form" action="/api/admin/settings" method="post" className="grid gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input name="notificationFallbackEnabled" type="checkbox" defaultChecked={settings.notificationFallbackEnabled} />
              启用全局 Notification SMTP fallback
            </label>
            <label className="grid gap-1.5">
              单用户每日邮件上限
              <input className="neu-input h-10 px-3" name="dailyEmailLimit" type="number" defaultValue={settings.dailyEmailLimit} />
            </label>
            <label className="grid gap-1.5">
              邮件失败重试次数
              <input className="neu-input h-10 px-3" name="emailRetryCount" type="number" defaultValue={settings.emailRetryCount} />
            </label>
            <label className="grid gap-1.5">
              arXiv 每板块抓取数量
              <input className="neu-input h-10 px-3" name="arxivMaxResultsPerCategory" type="number" defaultValue={settings.arxivMaxResultsPerCategory} />
            </label>
            <label className="grid gap-1.5">
              单用户每日 AI 阅读调用上限
              <input className="neu-input h-10 px-3" name="manualLlmCallsPerUserPerDay" type="number" min="0" defaultValue={settings.manualLlmCallsPerUserPerDay} />
            </label>
            <label className="grid gap-1.5">
              单用户并发 AI 阅读调用上限
              <input className="neu-input h-10 px-3" name="concurrentManualLlmCallsPerUser" type="number" min="0" defaultValue={settings.concurrentManualLlmCallsPerUser} />
            </label>
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">
              AI 阅读额度仅限制阅读页摘要和问答；日报自动摘要不占用该额度。
            </p>
            <div className="grid gap-2 rounded-xl border border-border/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">角色级 AI 阅读额度覆盖，留空沿用全局额度</p>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1.5">
                  user 每日
                  <input className="neu-input h-10 px-3" name="userRoleManualLlmCallsPerUserPerDay" type="number" min="0" defaultValue={settings.userRoleManualLlmCallsPerUserPerDay ?? ""} />
                </label>
                <label className="grid gap-1.5">
                  user 并发
                  <input className="neu-input h-10 px-3" name="userRoleConcurrentManualLlmCallsPerUser" type="number" min="0" defaultValue={settings.userRoleConcurrentManualLlmCallsPerUser ?? ""} />
                </label>
                <label className="grid gap-1.5">
                  admin 每日
                  <input className="neu-input h-10 px-3" name="adminRoleManualLlmCallsPerUserPerDay" type="number" min="0" defaultValue={settings.adminRoleManualLlmCallsPerUserPerDay ?? ""} />
                </label>
                <label className="grid gap-1.5">
                  admin 并发
                  <input className="neu-input h-10 px-3" name="adminRoleConcurrentManualLlmCallsPerUser" type="number" min="0" defaultValue={settings.adminRoleConcurrentManualLlmCallsPerUser ?? ""} />
                </label>
              </div>
            </div>
            <label className="grid gap-1.5">
              日志保留天数
              <input className="neu-input h-10 px-3" name="logRetentionDays" type="number" defaultValue={settings.logRetentionDays} />
            </label>
            <label className="grid gap-1.5">
              PDF 文本缓存保留天数
              <input className="neu-input h-10 px-3" name="pdfTextRetentionDays" type="number" defaultValue={settings.pdfTextRetentionDays} />
            </label>
            <label className="grid gap-1.5">
              备份保留天数
              <input className="neu-input h-10 px-3" name="backupRetentionDays" type="number" defaultValue={settings.backupRetentionDays} />
            </label>
            <label className="inline-flex items-center gap-2">
              <input name="smtpEnabled" type="checkbox" defaultChecked={smtp?.enabled ?? false} />
              启用管理员 SMTP
            </label>
            <input className="neu-input h-10 px-3" name="smtpHost" placeholder="SMTP Host" defaultValue={smtp?.host ?? ""} />
            <input className="neu-input h-10 px-3" name="smtpPort" type="number" placeholder="SMTP Port" defaultValue={smtp?.port ?? 587} />
            <label className="inline-flex items-center gap-2">
              <input name="smtpSecure" type="checkbox" defaultChecked={smtp?.secure ?? false} />
              使用 SMTPS
            </label>
            <input className="neu-input h-10 px-3" name="smtpFrom" placeholder="From" defaultValue={smtp?.from ?? ""} />
            <input className="neu-input h-10 px-3" name="smtpUsername" placeholder="SMTP User" defaultValue={smtp?.username ?? ""} />
            <input className="neu-input h-10 px-3" name="smtpPassword" placeholder="SMTP Password，留空保持不变" type="password" />
            <Button type="submit">保存策略</Button>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>当前事件摘要</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          {operationalIncidents.map((incident) => (
            <div key={incident.key} className="neu-inset rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{incident.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{incident.scope}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${incidentSeverityClassName(incident.severity)}`}>
                  {incidentSeverityLabel(incident.severity)}
                </span>
              </div>
              <p className="mt-2 break-all text-xs text-muted-foreground">证据：{incident.evidence}</p>
              <p className="mt-1 text-xs text-muted-foreground">建议：{incident.actionHint}</p>
            </div>
          ))}
          {operationalIncidents.length === 0 ? (
            <p className="text-muted-foreground md:col-span-2">当前没有健康、任务、队列或 LLM 失败事件需要关注。</p>
          ) : null}
          <p className="text-xs text-muted-foreground md:col-span-2">
            事件摘要来自当前健康检查、任务失败聚合、队列趋势和 LLM 失败诊断；生产复盘仍应结合目标环境日志和证据 artifact。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>事件复盘快照</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">来自 scheduler 持久化的健康告警日志，可作为 incident 复盘起点。</p>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {incidentHistory.map((snapshot) => (
            <div key={snapshot.id} className="neu-inset rounded-xl px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{snapshot.createdAt.toLocaleString("zh-CN")}</p>
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">指纹：{snapshot.fingerprint}</p>
                </div>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
                  {jobStatusLabel(snapshot.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                告警项 {snapshot.items.length} · {snapshot.deliverySummary}
              </p>
              {snapshot.message ? (
                <p className="mt-1 break-all text-xs text-muted-foreground">{snapshot.message}</p>
              ) : null}
              {snapshot.items.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {snapshot.items.slice(0, 4).map((item) => (
                    <li key={item} className="break-all">{item}</li>
                  ))}
                </ul>
              ) : null}
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">查看复盘草稿</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/60 p-3 font-mono text-[11px]">
                  {snapshot.reviewDraft}
                </pre>
              </details>
            </div>
          ))}
          {incidentHistory.length === 0 ? (
            <p className="text-muted-foreground">暂无持久化健康告警。scheduler 触发健康告警后会在这里留下复盘快照。</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>任务失败聚合</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          {health.jobFailures.map((item) => (
            <div key={item.type} className="neu-inset rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span>{item.type}</span>
                <span className={item.alert ? "text-red-500" : "text-muted-foreground"}>
                  {item.alert ? "需关注" : "正常"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {health.jobFailureWindowHours}h · 完成 {item.terminalCount} · 失败 {item.failedCount} · 失败率 {(item.failureRate * 100).toFixed(0)}% · 连续失败 {item.consecutiveFailures}
              </p>
              {item.failureCategories.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  归类 {item.failureCategories.map((category) => `${jobFailureReasonLabel(category.category)} ${category.count}`).join(" / ")}
                </p>
              ) : null}
              {item.lastMessage ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.lastMessage}</p> : null}
            </div>
          ))}
          {health.jobFailures.length === 0 ? (
            <p className="text-muted-foreground">最近 {health.jobFailureWindowHours} 小时暂无已完成任务。</p>
          ) : null}
          <p className="text-xs text-muted-foreground md:col-span-2">
            告警阈值：连续失败 ≥ {health.jobFailureThresholds.consecutiveFailures}，或完成数 ≥ {health.jobFailureThresholds.minTerminalCount} 且失败率 ≥ {(health.jobFailureThresholds.failureRate * 100).toFixed(0)}%。
          </p>
        </CardContent>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>允许注册邮箱后缀</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action="/api/admin/domains" method="post" className="flex gap-2">
              <input className="neu-input h-10 min-w-0 flex-1 px-3 text-sm" name="domain" placeholder="example.edu" />
              <Button type="submit">添加</Button>
            </form>
            <div className="grid gap-2 text-sm">
              {domains.map((domain) => (
                <div key={domain.id} className="neu-inset flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{domain.domain}</p>
                    <p className="text-xs text-muted-foreground">{domain.enabled ? "允许注册" : "已禁用"}</p>
                  </div>
                  <form action="/api/admin/domains" method="post">
                    <input type="hidden" name="domainId" value={domain.id} />
                    <input type="hidden" name="enabled" value={domain.enabled ? "false" : "true"} />
                    <Button type="submit" variant="secondary">
                      {domain.enabled ? "禁用" : "启用"}
                    </Button>
                  </form>
                </div>
              ))}
              {domains.length === 0 ? <p className="text-sm text-muted-foreground">未配置时默认仅允许管理员邮箱后缀注册。</p> : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>手动任务</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action="/api/admin/crawl" method="post">
              <Button type="submit" variant="secondary">立即抓取订阅板块</Button>
            </form>
            <form action="/api/admin/reports/generate" method="post" className="flex gap-2">
              <input className="neu-input h-9 px-3 text-sm" name="batchDate" type="date" />
              <Button type="submit">生成全部日报</Button>
            </form>
            <form action="/api/admin/backup" method="post">
              <Button type="submit" variant="secondary">立即备份数据库</Button>
            </form>
            <form action="/api/admin/retention" method="post">
              <Button type="submit" variant="secondary">执行数据清理</Button>
            </form>
            <Button asChild variant="secondary">
              <a href="/api/admin/export">导出系统设置</a>
            </Button>
            <form action="/api/admin/import" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
              <input className="neu-input px-3 py-2 text-sm" name="portableExport" type="file" accept="application/json,.json" required />
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input name="includeSettings" type="checkbox" defaultChecked />
                系统设置
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input name="includeDomains" type="checkbox" defaultChecked />
                注册后缀
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input name="includeUsers" type="checkbox" defaultChecked />
                已有用户状态
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input name="confirmImport" type="checkbox" />
                确认写入
              </label>
              <Button type="submit" name="mode" value="preview" variant="secondary">预览导入</Button>
              <Button type="submit" name="mode" value="apply" variant="secondary">导入系统 JSON</Button>
            </form>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>数据生命周期</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">估算日志、缓存和 PDF 文本占用，并预览下一次数据清理会处理的边界。</p>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-5">
          {dataLifecycle.map((item) => (
            <div key={item.key} className="neu-inset rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span>{item.label}</span>
                <span className="text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                数量 {formatCompactNumber(item.count)}
                {item.cleanupCandidateCount !== undefined ? ` · 待清理 ${formatCompactNumber(item.cleanupCandidateCount)}` : ""}
              </p>
              {item.cleanupDescription ? (
                <p className="mt-1 break-all text-[11px] text-muted-foreground">{item.cleanupDescription}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">当前仅统计，不参与自动清理。</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>任务日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <form action="/admin" className="grid gap-2 rounded-xl border border-border/50 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <label className="grid gap-1.5">
                状态
                <select className="neu-input h-10 px-3" name="jobStatus" defaultValue={jobLogFilters.status ?? "all"}>
                  <option value="all">全部状态</option>
                  {JOB_LOG_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{jobStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                类型
                <select className="neu-input h-10 px-3" name="jobType" defaultValue={jobLogFilters.type ?? "all"}>
                  <option value="all">全部类型</option>
                  {JOB_LOG_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" className="self-end">筛选</Button>
              <Button asChild variant="secondary" className="self-end">
                <a href="/admin">重置</a>
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              共 {jobLogPagination.total} 条 · 第 {jobLogPagination.page}/{jobLogPagination.pageCount} 页 · 每页 {jobLogPagination.pageSize} 条
            </p>
            {jobs.map((log) => {
              const keys = jobCorrelationKeys.get(log.id) ?? { userIds: [], reportIds: [], paperIds: [] };
              const emailMatches = relatedEmailsFor(keys);
              const llmMatches = relatedLlmCallsFor(keys);
              const timeline = buildLogTimeline({ job: log, emails: emailMatches, llmCalls: llmMatches });
              const failureCategory = log.status === "failed" || log.status === "stalled" ? classifyJobFailureReason(log) : undefined;
              const rootCause = failureCategory ? summarizeLogRootCause({ job: log, timeline, category: failureCategory }) : null;
              const showCorrelation = hasLogCorrelationKeys(keys) || emailMatches.length > 0 || llmMatches.length > 0;

              return (
                <div key={log.id} className="neu-inset rounded-xl px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <span>{log.type}</span>
                    <span className="text-muted-foreground">{jobStatusLabel(log.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{log.message ?? "无消息"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{log.createdAt.toLocaleString("zh-CN")}</p>
                  {failureCategory ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      失败归类：{jobFailureReasonLabel(failureCategory)}
                    </p>
                  ) : null}
                  {rootCause ? (
                    <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground/80">
                        根因提示：{rootCause.summary}（{jobFailureReasonLabel(rootCause.category)} · {rootCause.confidence === "high" ? "高置信" : rootCause.confidence === "medium" ? "中置信" : "低置信"}）
                      </p>
                      <p className="mt-1 break-all">证据：{rootCause.evidence}</p>
                      <p className="mt-1">建议：{rootCause.actionHint}</p>
                    </div>
                  ) : null}
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {typeof log.metadata?.jobId === "string" ? log.metadata.jobId : ""}
                  </p>
                  {showCorrelation ? (
                    <div className="mt-2 rounded-lg border border-border/50 p-3 text-xs text-muted-foreground">
                      <p>
                        关联 key：
                        {keys.userIds.length > 0 ? ` user ${keys.userIds.slice(0, 2).join(" / ")}` : ""}
                        {keys.reportIds.length > 0 ? ` · report ${keys.reportIds.slice(0, 2).join(" / ")}` : ""}
                        {keys.paperIds.length > 0 ? ` · paper ${keys.paperIds.slice(0, 2).join(" / ")}` : ""}
                      </p>
                      <div className="mt-2 space-y-1">
                        <p className="font-medium text-foreground/80">事件时间线</p>
                        {timeline.map((event) => (
                          <p key={`${event.source}-${event.createdAt.toISOString()}-${event.label}`} className="break-all">
                            {event.createdAt.toLocaleString("zh-CN")} · {event.source} · {event.label} · {event.status}
                            {event.message ? ` · ${event.message.slice(0, 120)}` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">查看 metadata</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/60 p-3 font-mono text-[11px]">
                      {JSON.stringify(log.metadata, null, 2).slice(0, 4000)}
                    </pre>
                  </details>
                  {log.status === "failed" ? (
                    <form action="/api/admin/jobs/retry" method="post" className="mt-2">
                      <input type="hidden" name="logId" value={log.id} />
                      <Button type="submit" variant="secondary">重试</Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
            {jobs.length === 0 ? <p className="text-muted-foreground">暂无任务日志。</p> : null}
            <div className="flex items-center justify-between gap-2 pt-2">
              {jobLogPagination.hasPrevious ? (
                <Button asChild variant="secondary">
                  <a href={jobLogPageHref(jobLogFilters, jobLogPagination.previousPage)}>上一页</a>
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled>上一页</Button>
              )}
              {jobLogPagination.hasNext ? (
                <Button asChild variant="secondary">
                  <a href={jobLogPageHref(jobLogFilters, jobLogPagination.nextPage)}>下一页</a>
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled>下一页</Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>最近邮件日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {emails.map((log) => (
              <div key={log.id} className="neu-inset rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span>{log.recipient}</span>
                  <span className="text-muted-foreground">{emailStatusLabel(log.status)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{log.subject}</p>
              </div>
            ))}
            {emails.length === 0 ? <p className="text-muted-foreground">暂无邮件日志。</p> : null}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近 LLM 调用</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              {llmUsage.windows.map((window) => (
                <div key={window.days} className="neu-inset rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span>{window.days} 天 LLM</span>
                    <span className={window.failureRate > 0.1 ? "text-red-500" : "text-muted-foreground"}>
                      失败率 {(window.failureRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    调用 {window.calls} · prompt {formatCompactNumber(window.promptChars)} · completion {formatCompactNumber(window.completionChars)} · PDF {window.pdfCalls}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    估算成本 {formatUsd(window.estimatedCostUsd)} · tokens {formatCompactNumber(window.estimatedPromptTokens + window.estimatedCompletionTokens)} · 实测 {window.measuredTokenCalls}/{window.calls}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    endpoint {window.byEndpoint.slice(0, 3).map((item) => `${item.label}:${item.calls}`).join(" / ") || "无"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    model {window.byModel.slice(0, 2).map((item) => `${item.label}:${item.calls}`).join(" / ") || "无"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    user {window.byUser.slice(0, 2).map((item) => `${item.label}:${item.calls}`).join(" / ") || "无"}
                  </p>
                </div>
              ))}
            </div>
            <div className="neu-inset rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span>{llmUsage.trend.length} 天每日趋势</span>
                <span className="text-xs text-muted-foreground">
                  合计 {llmUsage.trend.reduce((total, point) => total + point.calls, 0)} 次 · {formatUsd(llmUsage.trend.reduce((total, point) => total + point.estimatedCostUsd, 0))}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <div className="flex h-36 min-w-[1200px] items-end gap-1.5">
                  {llmUsage.trend.map((point) => {
                    const height = point.calls > 0 ? Math.max(8, Math.round((point.calls / llmTrendMaxCalls) * 96)) : 4;
                    return (
                      <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div
                          className="flex h-24 w-full items-end rounded-lg bg-muted/45 px-1 py-1"
                          title={`${point.day}: 调用 ${point.calls}, 成本 ${formatUsd(point.estimatedCostUsd)}, 失败率 ${(point.failureRate * 100).toFixed(0)}%, 平均耗时 ${formatDurationMs(point.averageDurationMs)}`}
                        >
                          <div
                            className={point.failureRate > 0.1 ? "w-full rounded-md bg-red-500/80" : "w-full rounded-md bg-foreground/75"}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <div className="w-full truncate text-center text-[10px] text-muted-foreground">{point.day.slice(5).replace("-", "/")}</div>
                        <div className="text-[10px] text-muted-foreground">{point.calls}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                红色表示当天失败率超过 10%；悬停可查看估算成本、失败率和平均耗时。成本优先使用供应商 usage token，缺失时按 `LLM_COST_RATES_JSON` 与约 {llmUsage.costEstimate.charsPerToken} chars/token 估算
                {llmUsage.costEstimate.configured ? `，已配置 ${llmUsage.costEstimate.pricedModels.length} 个模型价格` : "，当前未配置模型价格"}。
              </p>
              {llmUsage.costEstimate.unpricedModels.length > 0 ? (
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  未配置价格模型：{llmUsage.costEstimate.unpricedModels.join(" / ")}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="neu-inset rounded-xl px-4 py-3">
                <p className="text-sm font-medium">高失败率模型</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {llmUsage.insights.highFailureModels.map((item) => (
                    <p key={item.key} className="break-all">
                      {item.label} · 失败率 {(item.failureRate * 100).toFixed(0)}% · {item.failed}/{item.calls}
                    </p>
                  ))}
                  {llmUsage.insights.highFailureModels.length === 0 ? <p>暂无失败模型。</p> : null}
                </div>
              </div>
              <div className="neu-inset rounded-xl px-4 py-3">
                <p className="text-sm font-medium">高耗时 endpoint</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {llmUsage.insights.highLatencyEndpoints.map((item) => (
                    <p key={item.key} className="break-all">
                      {item.label} · 平均 {formatDurationMs(item.averageDurationMs)} · {item.durationSamples} 次
                    </p>
                  ))}
                  {llmUsage.insights.highLatencyEndpoints.length === 0 ? <p>暂无耗时样本。</p> : null}
                </div>
              </div>
              <div className="neu-inset rounded-xl px-4 py-3">
                <p className="text-sm font-medium">高消耗用户</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {llmUsage.insights.highUsageUsers.map((item) => (
                    <p key={item.key} className="break-all">
                      {item.label} · {formatCompactNumber(item.totalChars)} chars · {formatUsd(item.estimatedCostUsd)} · {item.calls} 次
                    </p>
                  ))}
                  {llmUsage.insights.highUsageUsers.length === 0 ? <p>暂无消耗数据。</p> : null}
                </div>
              </div>
            </div>
            <div className="neu-inset rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">LLM 失败诊断</p>
                <span className="text-xs text-muted-foreground">最近 {llmUsage.insights.days} 天</span>
              </div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                {llmUsage.insights.failureDiagnostics.map((item) => (
                  <div key={item.category} className="rounded-lg border border-border/50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{item.label} · {item.count} 次</span>
                      <span>{item.lastAt ? item.lastAt.toLocaleString("zh-CN") : "无时间"}</span>
                    </div>
                    <p className="mt-1 break-all">
                      最近：{item.lastEndpoint ?? "unknown"}/{item.lastModel ?? "unknown"}{item.lastError ? ` · ${item.lastError.slice(0, 160)}` : ""}
                    </p>
                    <p className="mt-1">建议：{item.actionHint}</p>
                  </div>
                ))}
                {llmUsage.insights.failureDiagnostics.length === 0 ? <p>最近暂无 LLM 失败。</p> : null}
              </div>
            </div>
            {llmLogs.map((log) => (
              <div key={log.id} className="neu-inset rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span>{log.endpoint}</span>
                  <span className="text-muted-foreground">{llmStatusLabel(log.status)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.model} · prompt {log.promptChars} · completion {log.completionChars}
                  {log.promptTokens !== null || log.completionTokens !== null || log.totalTokens !== null
                    ? ` · tokens ${log.promptTokens ?? "-"} / ${log.completionTokens ?? "-"} / ${log.totalTokens ?? "-"}`
                    : ""}
                </p>
                {log.error ? <p className="mt-1 text-xs text-red-500">{log.error}</p> : null}
              </div>
            ))}
            {llmLogs.length === 0 ? <p className="text-muted-foreground">暂无 LLM 调用。</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>最近备份</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {backups.map((backup) => (
              <div key={backup.path} className="neu-inset rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span className="break-all font-mono text-xs">{backup.name}</span>
                  <span className="text-muted-foreground">{Math.ceil(backup.sizeBytes / 1024)} KB</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{backup.createdAt.toLocaleString("zh-CN")}</p>
              </div>
            ))}
            {backups.length === 0 ? <p className="text-muted-foreground">暂无备份文件。</p> : null}
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>用户管理</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">邮箱</th>
                  <th className="pb-3 pr-4 font-medium">角色</th>
                  <th className="pb-3 pr-4 font-medium">验证</th>
                  <th className="pb-3 pr-4 font-medium">账号</th>
                  <th className="pb-3 pr-4 font-medium">通知</th>
                  <th className="pb-3 pr-4 font-medium">AI 额度</th>
                  <th className="pb-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-t border-border/40">
                    <td className="py-3 pr-4">{item.email}</td>
                    <td className="py-3 pr-4">{item.role}</td>
                    <td className="py-3 pr-4">{item.emailVerified ? "已验证" : "未验证"}</td>
                    <td className="py-3 pr-4">{item.disabled ? "已禁用" : "正常"}</td>
                    <td className="py-3 pr-4">{item.notificationDisabled ? "已禁用" : "已启用"}</td>
                    <td className="py-3 pr-4">
                      <form action="/api/admin/users/limits" method="post" className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={item.id} />
                        <input
                          className="neu-input h-9 w-20 px-2 text-xs"
                          name="manualLlmCallsPerUserPerDayOverride"
                          type="number"
                          min="0"
                          placeholder="每日"
                          defaultValue={item.manualLlmCallsPerUserPerDayOverride ?? ""}
                        />
                        <input
                          className="neu-input h-9 w-20 px-2 text-xs"
                          name="concurrentManualLlmCallsPerUserOverride"
                          type="number"
                          min="0"
                          placeholder="并发"
                          defaultValue={item.concurrentManualLlmCallsPerUserOverride ?? ""}
                        />
                        <Button type="submit" variant="secondary">保存</Button>
                      </form>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <form action="/api/admin/users/status" method="post">
                          <input type="hidden" name="userId" value={item.id} />
                          <input type="hidden" name="disabled" value={item.disabled ? "false" : "true"} />
                          <Button type="submit" variant="secondary" disabled={item.id === currentAdmin.id && !item.disabled}>
                            {item.disabled ? "启用账号" : item.id === currentAdmin.id ? "当前账号" : "禁用账号"}
                          </Button>
                        </form>
                        <form action="/api/admin/users/notification" method="post">
                          <input type="hidden" name="userId" value={item.id} />
                          <input type="hidden" name="notificationDisabled" value={item.notificationDisabled ? "false" : "true"} />
                          <Button type="submit" variant="secondary">
                            {item.notificationDisabled ? "启用通知" : "禁用通知"}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
