import { Activity, ArrowUpRight, Database, Send, Sparkles, TriangleAlert } from "lucide-react";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/app/authz";
import { getManualLlmQuotaStatus } from "@/lib/app/llm-usage";
import { db } from "@/lib/db";
import { emailLog, jobLog, llmCallLog, paper, paperSummary, report, userPaperState, userPreference } from "@/lib/db/schema";
import { jobStatusLabel, reportReasonLabel, reportStatusLabel } from "@/lib/reports/status-labels";

export const dynamic = "force-dynamic";

type TrendPoint = {
  day: string;
  count: number;
};

function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastSevenUtcDays(now = new Date()) {
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() - (6 - index));
    return utcDayKey(day);
  });
}

function countByUtcDay<T>(items: T[], days: string[], getDate: (item: T) => Date): TrendPoint[] {
  const counts = new Map(days.map((day) => [day, 0]));
  for (const item of items) {
    const day = utcDayKey(getDate(item));
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

function TrendPanel({ title, points }: { title: string; points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="neu-inset rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">合计 {total}</p>
      </div>
      <div className="mt-4 flex h-32 items-end gap-2">
        {points.map((point) => {
          const height = point.count > 0 ? Math.max(10, Math.round((point.count / max) * 100)) : 4;
          return (
            <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end rounded-lg bg-muted/45 px-1 py-1">
                <div
                  className="w-full rounded-md bg-foreground/75"
                  style={{ height: `${height}%` }}
                  title={`${point.day}: ${point.count}`}
                />
              </div>
              <div className="w-full truncate text-center text-[11px] text-muted-foreground">{point.day.slice(5).replace("-", "/")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const currentUser = await requireAppUser();
  const isAdmin = currentUser.role === "admin";
  const trendDays = lastSevenUtcDays();
  const since = new Date(`${trendDays[0]}T00:00:00.000Z`);

  const [
    preference,
    allRecentPapers,
    paperCount,
    summaryCount,
    llmCallCount,
    sentCount,
    failedCount,
    favoriteCount,
    jobs,
    userReports,
    trendReports,
    trendLlmCalls,
    manualLlmQuota
  ] = await Promise.all([
    db.query.userPreference.findFirst({ where: eq(userPreference.userId, currentUser.id) }),
    db.select().from(paper).where(gte(paper.publishedAt, since)).orderBy(desc(paper.publishedAt)).limit(500),
    db.select({ count: sql<number>`count(*)::int` }).from(paper).where(gte(paper.publishedAt, since)).then(([row]) => row?.count ?? 0),
    isAdmin
      ? db.select({ count: sql<number>`count(*)::int` }).from(paperSummary).where(gte(paperSummary.createdAt, since)).then(([row]) => row?.count ?? 0)
      : db.select({ count: sql<number>`count(*)::int` }).from(paperSummary).where(and(eq(paperSummary.userId, currentUser.id), gte(paperSummary.createdAt, since))).then(([row]) => row?.count ?? 0),
    isAdmin
      ? db.select({ count: sql<number>`count(*)::int` }).from(llmCallLog).where(gte(llmCallLog.createdAt, since)).then(([row]) => row?.count ?? 0)
      : db.select({ count: sql<number>`count(*)::int` }).from(llmCallLog).where(and(eq(llmCallLog.userId, currentUser.id), gte(llmCallLog.createdAt, since))).then(([row]) => row?.count ?? 0),
    isAdmin
      ? db.select({ count: sql<number>`count(*)::int` }).from(emailLog).where(eq(emailLog.status, "sent")).then(([row]) => row?.count ?? 0)
      : db.select({ count: sql<number>`count(*)::int` }).from(emailLog).where(and(eq(emailLog.userId, currentUser.id), eq(emailLog.status, "sent"))).then(([row]) => row?.count ?? 0),
    isAdmin
      ? db.select({ count: sql<number>`count(*)::int` }).from(report).where(eq(report.status, "failed")).then(([row]) => row?.count ?? 0)
      : db.select({ count: sql<number>`count(*)::int` }).from(report).where(and(eq(report.userId, currentUser.id), eq(report.status, "failed"))).then(([row]) => row?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(userPaperState).where(and(eq(userPaperState.userId, currentUser.id), eq(userPaperState.favorited, true))).then(([row]) => row?.count ?? 0),
    db.query.jobLog.findMany({ orderBy: desc(jobLog.createdAt), limit: 8 }),
    db.query.report.findMany({ where: eq(report.userId, currentUser.id), orderBy: desc(report.createdAt), limit: 8 }),
    isAdmin
      ? db.select({ createdAt: report.createdAt }).from(report).where(gte(report.createdAt, since))
      : db.select({ createdAt: report.createdAt }).from(report).where(and(eq(report.userId, currentUser.id), gte(report.createdAt, since))),
    isAdmin
      ? db.select({ createdAt: llmCallLog.createdAt }).from(llmCallLog).where(gte(llmCallLog.createdAt, since))
      : db.select({ createdAt: llmCallLog.createdAt }).from(llmCallLog).where(and(eq(llmCallLog.userId, currentUser.id), gte(llmCallLog.createdAt, since))),
    isAdmin ? Promise.resolve(null) : getManualLlmQuotaStatus(currentUser.id)
  ]);

  const relevantRecentPapers = allRecentPapers.filter((item) =>
    item.categories.some((category) => preference?.categories.includes(category))
  );
  const userPaperCount = relevantRecentPapers.length;
  const paperTrend = countByUtcDay(isAdmin ? allRecentPapers : relevantRecentPapers, trendDays, (item) => item.publishedAt);
  const reportTrend = countByUtcDay(trendReports, trendDays, (item) => item.createdAt);
  const llmTrend = countByUtcDay(trendLlmCalls, trendDays, (item) => item.createdAt);

  const kpis = isAdmin
    ? [
        { label: "7 天全局论文", value: String(paperCount), delta: "入库", hint: "所有用户订阅板块并集", icon: Database },
        { label: "7 天摘要总数", value: String(summaryCount), delta: "LLM", hint: "全站用户摘要", icon: Sparkles },
        { label: "7 天 LLM 调用", value: String(llmCallCount), delta: "调用", hint: "日报、阅读摘要和问答", icon: Sparkles },
        { label: "全站邮件已发送", value: String(sentCount), delta: "SMTP", hint: "用户 SMTP 或管理员 fallback", icon: Send },
        { label: "失败日报", value: String(failedCount), delta: "需处理", hint: "全站失败日报", icon: TriangleAlert }
      ]
    : [
        { label: "我的候选论文", value: String(userPaperCount), delta: "订阅", hint: preference?.categories.join(", ") || "未配置订阅", icon: Database },
        { label: "我的摘要", value: String(summaryCount), delta: "LLM", hint: "只统计当前账号", icon: Sparkles },
        {
          label: "今日 AI 阅读",
          value: `${manualLlmQuota?.usedToday ?? 0}/${manualLlmQuota?.manualLlmCallsPerUserPerDay ?? 0}`,
          delta: `剩余 ${manualLlmQuota?.remainingToday ?? 0}`,
          hint: `阅读页摘要/问答，不含日报 · 并发 ${manualLlmQuota?.running ?? 0}/${manualLlmQuota?.concurrentManualLlmCallsPerUser ?? 0}`,
          icon: Sparkles
        },
        { label: "我的邮件", value: String(sentCount), delta: "SMTP", hint: "只发送到已验证注册邮箱", icon: Send },
        { label: "我的收藏", value: String(favoriteCount), delta: "论文池", hint: "收藏论文数量", icon: TriangleAlert }
      ];

  const tasks = [
    { name: "arXiv 全局抓取", owner: "arxiv-crawl", target: "订阅 category 并集", status: jobs.find((job) => job.type === "arxiv-crawl")?.status ?? "idle" },
    { name: "日报生成", owner: "report-generation", target: "用户偏好 Top N", status: jobs.find((job) => job.type === "report-generation")?.status ?? "idle" },
    { name: "邮件通知", owner: "email-notification", target: "已验证注册邮箱", status: jobs.find((job) => job.type === "email-notification")?.status ?? "idle" },
    { name: "数据库备份", owner: "backup", target: "./data/backups", status: "manual" }
  ];

  return (
    <div className="space-y-6">
      <div className="neu-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 neu-inset rounded-full px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {isAdmin ? "管理员视图" : "普通用户视图"}
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">{isAdmin ? "团队仪表板" : "我的仪表板"}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {isAdmin
                ? "汇总 arXiv 抓取、摘要生成、邮件通知和后台队列状态。"
                : "查看自己的订阅、候选论文、日报生成和邮件通知状态。"}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-sm text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <div className="text-3xl font-semibold">{kpi.value}</div>
                <div className="neu-inset inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs">
                  <ArrowUpRight className="h-3 w-3" />
                  {kpi.delta}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>7 天趋势</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "按 UTC 日期统计全站论文入库、日报生成和 LLM 调用。" : "按 UTC 日期统计你的候选论文、日报生成和 LLM 调用。"}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <TrendPanel title={isAdmin ? "全局论文" : "候选论文"} points={paperTrend} />
          <TrendPanel title="日报" points={reportTrend} />
          <TrendPanel title="LLM 调用" points={llmTrend} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>{isAdmin ? "实时活动流" : "我的日报动态"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{isAdmin ? "最近后台任务日志。" : "当前账号最近日报记录。"}</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            {(isAdmin ? jobs : userReports).map((item) => (
              <div key={item.id} className="grid grid-cols-[8rem_1fr] gap-3 text-sm">
                <div className="text-xs text-muted-foreground">{item.createdAt.toLocaleString("zh-CN")}</div>
                <div className="border-l-2 border-accent/20 pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{isAdmin ? ("type" in item ? item.type : "") : ("batchDate" in item ? `日报 ${item.batchDate}` : "")}</p>
                    <span className="neu-inset rounded-full px-2 py-0.5 text-xs text-muted-foreground">
                      {isAdmin ? jobStatusLabel(item.status) : reportStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {isAdmin ? ("message" in item ? item.message ?? "无消息" : "") : ("reason" in item ? reportReasonLabel(item.reason) : "")}
                  </p>
                </div>
              </div>
            ))}
            {(isAdmin ? jobs : userReports).length === 0 ? (
              <p className="text-sm text-muted-foreground">{isAdmin ? "暂无后台活动。" : "暂无日报记录。"}</p>
            ) : null}
          </CardContent>
        </Card>

        {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>任务表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">任务</th>
                    <th className="pb-3 pr-4 font-medium">执行者</th>
                    <th className="pb-3 pr-4 font-medium">目标</th>
                    <th className="pb-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.name} className="border-t border-border/40">
                      <td className="py-3 pr-4 font-medium">{task.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{task.owner}</td>
                      <td className="py-3 pr-4">{task.target}</td>
                      <td className="py-3">
                        <span className="neu-inset inline-block rounded-full px-3 py-1 text-xs">{jobStatusLabel(task.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>我的订阅</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="neu-inset rounded-xl px-4 py-3">
              <p className="text-muted-foreground">订阅板块</p>
              <p className="mt-1 font-medium">{preference?.categories.join(", ") || "未配置"}</p>
            </div>
            <div className="neu-inset rounded-xl px-4 py-3">
              <p className="text-muted-foreground">Top N</p>
              <p className="mt-1 font-medium">{preference?.topN ?? "未配置"}</p>
            </div>
            <div className="neu-inset rounded-xl px-4 py-3">
              <p className="text-muted-foreground">推送时间</p>
              <p className="mt-1 font-medium">{preference ? `${preference.timezone} ${preference.sendTime}` : "未配置"}</p>
            </div>
          </CardContent>
        </Card>
        )}
      </section>
    </div>
  );
}
