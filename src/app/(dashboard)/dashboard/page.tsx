import { Activity, ArrowUpRight, Database, RefreshCw, Send, Sparkles, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const kpis = [
  {
    label: "今日候选论文",
    value: "128",
    delta: "+18%",
    hint: "来自 6 个订阅板块",
    icon: Database
  },
  {
    label: "已生成摘要",
    value: "24",
    delta: "+6",
    hint: "Top N 批量任务",
    icon: Sparkles
  },
  {
    label: "邮件已发送",
    value: "17",
    delta: "94%",
    hint: "Notification SMTP",
    icon: Send
  },
  {
    label: "待处理失败",
    value: "2",
    delta: "-3",
    hint: "普通失败仅站内显示",
    icon: TriangleAlert
  }
];

const trend = [
  { day: "周一", papers: 84, summaries: 16 },
  { day: "周二", papers: 96, summaries: 20 },
  { day: "周三", papers: 72, summaries: 14 },
  { day: "周四", papers: 118, summaries: 22 },
  { day: "周五", papers: 104, summaries: 19 },
  { day: "周六", papers: 128, summaries: 24 },
  { day: "周日", papers: 91, summaries: 15 }
];

const activities = [
  { time: "刚刚", title: "cs.CL 批次入库完成", detail: "新增 42 篇，按主 ID 去重 7 篇", status: "成功" },
  { time: "09:12", title: "日报生成完成", detail: "han@example.com · Top 5 · 未配置邮件", status: "完成" },
  { time: "09:05", title: "LLM 摘要任务重试", detail: "OpenAI-compatible provider 返回 429", status: "重试" },
  { time: "08:48", title: "stat.ML 最近 7 天补抓", detail: "新订阅 category 自动补抓", status: "成功" }
];

const tasks = [
  {
    name: "arXiv 全局抓取",
    owner: "scheduler",
    target: "cs.CL, cs.AI, stat.ML",
    status: "running",
    nextRun: "10:15"
  },
  {
    name: "日报生成",
    owner: "worker",
    target: "Asia/Shanghai 09:00",
    status: "waiting",
    nextRun: "延迟到最新批次"
  },
  {
    name: "邮件通知",
    owner: "email-queue",
    target: "用户 SMTP > fallback",
    status: "idle",
    nextRun: "按日报完成触发"
  },
  {
    name: "数据库备份",
    owner: "backup",
    target: "./data/backups",
    status: "scheduled",
    nextRun: "明日 03:00"
  }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="neu-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 neu-inset rounded-full px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              模拟数据 · 离线可用
            </div>
            <h1 className="text-2xl font-semibold tracking-normal">团队仪表板</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              汇总 arXiv 抓取、摘要生成、邮件通知和后台队列状态。第一版使用本地模拟数据，后续接入服务端真实任务状态。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="neu-inset inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              自动刷新
            </span>
            <button className="neu-btn flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
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

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>7 天趋势</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">候选论文和已生成摘要的相对变化。</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-end gap-3">
              {trend.map((item) => (
                <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="neu-inset flex h-48 w-full items-end justify-center gap-1 rounded-xl px-2 py-2">
                    <div
                      className="w-full max-w-5 rounded-md bg-foreground"
                      style={{ height: `${Math.max(12, (item.papers / 128) * 100)}%` }}
                      title={`${item.papers} 篇候选论文`}
                    />
                    <div
                      className="w-full max-w-5 rounded-md bg-muted-foreground"
                      style={{ height: `${Math.max(12, (item.summaries / 24) * 100)}%` }}
                      title={`${item.summaries} 篇摘要`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{item.day}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-foreground" />
                候选论文
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm bg-muted-foreground" />
                已生成摘要
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>实时活动流</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activities.map((activity) => (
              <div key={`${activity.time}-${activity.title}`} className="grid grid-cols-[4rem_1fr] gap-3 text-sm">
                <div className="text-xs text-muted-foreground">{activity.time}</div>
                <div className="border-l-2 border-accent/20 pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{activity.title}</p>
                    <span className="neu-inset rounded-full px-2 py-0.5 text-xs text-muted-foreground">{activity.status}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{activity.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>任务表</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">与后台队列和计划任务对应，后续直接读取服务端任务状态。</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">任务</th>
                  <th className="pb-3 pr-4 font-medium">执行者</th>
                  <th className="pb-3 pr-4 font-medium">目标</th>
                  <th className="pb-3 pr-4 font-medium">状态</th>
                  <th className="pb-3 text-right font-medium">下一次</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.name} className="border-t border-border/40">
                    <td className="py-3 pr-4 font-medium">{task.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{task.owner}</td>
                    <td className="py-3 pr-4">{task.target}</td>
                    <td className="py-3 pr-4">
                      <span className="neu-inset inline-block rounded-full px-3 py-1 text-xs">{task.status}</span>
                    </td>
                    <td className="py-3 text-right text-muted-foreground">{task.nextRun}</td>
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
