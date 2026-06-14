import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/app/authz";
import { getAdminSettings } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { adminNotificationSmtpConfig, allowedEmailDomain, emailLog, jobLog, paper, report, user } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function countRows(table: typeof user | typeof paper | typeof report) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
  return row?.count ?? 0;
}

export default async function AdminPage() {
  await requireAdmin();
  const [settings, smtp, domains, jobs, emails, users, userCount, paperCount, reportCount] = await Promise.all([
    getAdminSettings(),
    db.query.adminNotificationSmtpConfig.findFirst({ where: eq(adminNotificationSmtpConfig.id, "system") }),
    db.query.allowedEmailDomain.findMany({ orderBy: allowedEmailDomain.domain }),
    db.query.jobLog.findMany({ orderBy: desc(jobLog.createdAt), limit: 6 }),
    db.query.emailLog.findMany({ orderBy: desc(emailLog.createdAt), limit: 6 }),
    db.query.user.findMany({ orderBy: desc(user.createdAt), limit: 20 }),
    countRows(user),
    countRows(paper),
    countRows(report)
  ]);

  const checks = [
    ["公开健康检查", "/api/health"],
    ["用户数", String(userCount)],
    ["论文数", String(paperCount)],
    ["日报数", String(reportCount)],
    ["Notification SMTP", smtp?.enabled ? "已启用" : "未启用"],
    ["注册域名", `${domains.filter((domain) => domain.enabled).length} 个启用`]
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理员后台</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理注册后缀、通知 fallback、限流、任务日志和健康状态。</p>
      </div>
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
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {domains.map((domain) => (
                <span key={domain.id} className="neu-inset rounded-full px-3 py-1">{domain.domain}</span>
              ))}
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
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近任务日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {jobs.map((log) => (
              <div key={log.id} className="neu-inset rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span>{log.type}</span>
                  <span className="text-muted-foreground">{log.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{log.message ?? "无消息"}</p>
              </div>
            ))}
            {jobs.length === 0 ? <p className="text-muted-foreground">暂无任务日志。</p> : null}
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
                  <span className="text-muted-foreground">{log.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{log.subject}</p>
              </div>
            ))}
            {emails.length === 0 ? <p className="text-muted-foreground">暂无邮件日志。</p> : null}
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>用户通知控制</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">邮箱</th>
                  <th className="pb-3 pr-4 font-medium">角色</th>
                  <th className="pb-3 pr-4 font-medium">验证</th>
                  <th className="pb-3 pr-4 font-medium">通知</th>
                  <th className="pb-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-t border-border/40">
                    <td className="py-3 pr-4">{item.email}</td>
                    <td className="py-3 pr-4">{item.role}</td>
                    <td className="py-3 pr-4">{item.emailVerified ? "已验证" : "未验证"}</td>
                    <td className="py-3 pr-4">{item.notificationDisabled ? "已禁用" : "已启用"}</td>
                    <td className="py-3 text-right">
                      <form action="/api/admin/users/notification" method="post">
                        <input type="hidden" name="userId" value={item.id} />
                        <input type="hidden" name="notificationDisabled" value={item.notificationDisabled ? "false" : "true"} />
                        <Button type="submit" variant="secondary">
                          {item.notificationDisabled ? "启用通知" : "禁用通知"}
                        </Button>
                      </form>
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
