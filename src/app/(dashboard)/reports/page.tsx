import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/app/authz";
import { db } from "@/lib/db";
import { report, reportVersion } from "@/lib/db/schema";
import { emailStatusLabel, reportReasonLabel, reportStatusLabel } from "@/lib/reports/status-labels";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireAppUser();
  const reports = await db.query.report.findMany({
    where: eq(report.userId, user.id),
    orderBy: desc(report.createdAt),
    limit: 30
  });
  const versions = await Promise.all(
    reports.map((item) =>
      db.query.reportVersion.findFirst({
        where: eq(reportVersion.reportId, item.id),
        orderBy: desc(reportVersion.version)
      })
    )
  );
  const versionByReport = new Map(reports.map((item, index) => [item.id, versions[index]]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">日报历史</h1>
          <p className="mt-1 text-sm text-muted-foreground">日报长期保存，重生成会保留历史版本，默认展示最新版。</p>
        </div>
        <form action="/api/reports/generate" method="post" className="flex gap-2">
          <input className="neu-input h-9 px-3 text-sm" name="batchDate" type="date" />
          <Button type="submit">生成我的日报</Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>日报列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">批次</th>
                  <th className="pb-3 pr-4 font-medium">状态</th>
                  <th className="pb-3 pr-4 font-medium">原因</th>
                  <th className="pb-3 pr-4 font-medium">版本</th>
                  <th className="pb-3 pr-4 font-medium">邮件</th>
                  <th className="pb-3 text-right font-medium">导出</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item) => (
                  <tr key={item.id} className="border-t border-border/40">
                    <td className="py-3 pr-4 font-mono">
                      <Link className="hover:underline" href={`/reports/${item.id}`}>{item.batchDate}</Link>
                    </td>
                    <td className="py-3 pr-4">{reportStatusLabel(item.status)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{reportReasonLabel(item.reason)}</td>
                    <td className="py-3 pr-4">v{item.latestVersion}</td>
                    <td className="py-3 pr-4">{emailStatusLabel(item.emailStatus)}</td>
                    <td className="py-3 text-right">
                      {versionByReport.get(item.id)?.markdown ? (
                        <Link className="neu-btn inline-flex h-9 items-center rounded-xl px-4 text-sm" href={`/api/reports/${item.id}/markdown`}>
                          Markdown
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">无内容</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reports.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              保存订阅并完成首次抓取后，这里会展示日报版本、生成状态和邮件状态。
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
