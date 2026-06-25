import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/app/authz";
import { userReportWhere } from "@/lib/app/report-access";
import { buildReportPaperDetails, diffReportVersionPaperIds, matchesReportPaperDetailQuery, reportPaperVersionChange, type ReportPaperDetail, type ReportPaperVersionChange } from "@/lib/app/report-detail";
import { db } from "@/lib/db";
import { paper, paperMetric, report, reportVersion, userPreference } from "@/lib/db/schema";
import { emailStatusLabel, reportStatusLabel } from "@/lib/reports/status-labels";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string }>;
};

function detailLabels(ids: string[], detailsById: Map<string, ReportPaperDetail>) {
  if (ids.length === 0) return "无";
  return ids
    .map((paperId) => detailsById.get(paperId)?.title ?? paperId)
    .join(" / ");
}

function changeLabel(change: ReportPaperVersionChange) {
  if (change === "added") return "新增";
  if (change === "moved") return "重排";
  return "";
}

function changeClassName(change: ReportPaperVersionChange) {
  if (change === "added") return "border border-emerald-500/40 bg-emerald-500/5";
  if (change === "moved") return "border border-amber-500/40 bg-amber-500/5";
  return "border border-transparent";
}

export default async function ReportDetailPage({ params, searchParams }: Props) {
  const user = await requireAppUser();
  const { id } = await params;
  const query = ((await searchParams)?.q ?? "").trim();
  const currentReport = await db.query.report.findFirst({
    where: userReportWhere(id, user.id)
  });
  if (!currentReport) {
    return (
      <div className="neu-card p-6">
        <p className="text-sm text-muted-foreground">日报不存在。</p>
      </div>
    );
  }

  const versions = await db.query.reportVersion.findMany({
    where: eq(reportVersion.reportId, id),
    orderBy: asc(reportVersion.version)
  });
  const paperIds = Array.from(new Set(versions.flatMap((version) => version.selectedPaperIds)));
  const [preference, paperRows, metricRows] = await Promise.all([
    db.query.userPreference.findFirst({ where: eq(userPreference.userId, user.id) }),
    paperIds.length ? db.query.paper.findMany({ where: inArray(paper.arxivId, paperIds) }) : [],
    paperIds.length ? db.query.paperMetric.findMany({ where: inArray(paperMetric.arxivId, paperIds) }) : []
  ]);
  const details = buildReportPaperDetails({
    paperIds,
    papers: paperRows,
    metrics: metricRows,
    preference
  });
  const detailsById = new Map(details.map((detail) => [detail.arxivId, detail]));
  const matchingDetailIds = new Set(details.filter((detail) => matchesReportPaperDetailQuery(detail, query)).map((detail) => detail.arxivId));
  const matchedCount = query ? matchingDetailIds.size : details.length;

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-muted-foreground hover:underline" href="/reports">返回日报历史</Link>
        <h1 className="mt-2 text-2xl font-semibold">日报 {currentReport.batchDate}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          状态 {reportStatusLabel(currentReport.status)} · 最新版本 v{currentReport.latestVersion} · 邮件 {emailStatusLabel(currentReport.emailStatus)}
        </p>
      </div>

      <div className="neu-card p-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center" action={`/reports/${encodeURIComponent(currentReport.id)}`}>
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-muted-foreground">搜索本日报论文</span>
            <input
              className="neu-input h-10 w-full px-3 text-sm"
              name="q"
              defaultValue={query}
              placeholder="标题、arXiv ID、分类、摘要或入选原因"
            />
          </label>
          <div className="flex items-center gap-2 sm:pt-6">
            <button className="neu-btn-primary h-10 rounded-xl px-4 text-sm" type="submit">
              搜索
            </button>
            {query ? (
              <Link className="neu-btn inline-flex h-10 items-center rounded-xl px-4 text-sm" href={`/reports/${encodeURIComponent(currentReport.id)}`}>
                清除
              </Link>
            ) : null}
          </div>
        </form>
        {query ? (
          <p className="mt-2 text-xs text-muted-foreground">匹配 {matchedCount} / {details.length} 篇论文</p>
        ) : null}
      </div>

      <div className="grid gap-4">
        {versions.map((version, index) => {
          const previous = index > 0 ? versions[index - 1]?.selectedPaperIds ?? [] : [];
          const diff = diffReportVersionPaperIds(previous, version.selectedPaperIds);
          const allVersionDetails = version.selectedPaperIds.map((paperId) => detailsById.get(paperId)).filter(Boolean) as ReportPaperDetail[];
          const versionDetails = query ? allVersionDetails.filter((detail) => matchingDetailIds.has(detail.arxivId)) : allVersionDetails;
          return (
            <Card key={version.id}>
              <CardHeader>
                <CardTitle>v{version.version}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="neu-inset rounded-full px-3 py-1">{version.createdAt.toLocaleString("zh-CN")}</span>
                  <span className="neu-inset rounded-full px-3 py-1">{version.model ?? "no LLM"}</span>
                  <span className="neu-inset rounded-full px-3 py-1">{version.promptVersion}</span>
                </div>
                {index > 0 ? (
                  <div className="neu-inset space-y-1 rounded-xl px-4 py-3">
                    <p>新增：{detailLabels(diff.added, detailsById)}</p>
                    <p>移除：{detailLabels(diff.removed, detailsById)}</p>
                    <p>重排：{diff.moved.length > 0 ? detailLabels(diff.moved, detailsById) : "无"}</p>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-muted-foreground">入选论文</p>
                  {versionDetails.length > 0 ? (
                    <ol className="space-y-3">
                      {versionDetails.map((detail) => {
                        const change = reportPaperVersionChange(diff, detail.arxivId);
                        const label = changeLabel(change);
                        return (
                          <li key={detail.arxivId} className={`neu-inset rounded-xl px-4 py-3 ${changeClassName(change)}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium leading-snug">{detail.title}</p>
                                  {label ? (
                                    <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-foreground">{label}</span>
                                  ) : null}
                                </div>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{detail.arxivId}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {detail.primaryCategory ? <span className="neu-inset rounded-full px-2 py-1">{detail.primaryCategory}</span> : null}
                                {detail.score !== null ? <span className="neu-inset rounded-full px-2 py-1">{detail.score.toFixed(1)} 分</span> : null}
                              </div>
                            </div>
                            {detail.abstractPreview ? (
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">摘要：{detail.abstractPreview}</p>
                            ) : null}
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              入选原因：{detail.reasons.join(" · ")}
                            </p>
                            <Link className="mt-2 inline-flex text-xs font-medium text-accent hover:underline" href={`/read?paper=${encodeURIComponent(detail.arxivId)}`}>
                              在阅读页打开
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className="neu-inset rounded-xl px-4 py-3 text-sm text-muted-foreground">
                      当前搜索没有匹配这个版本的论文。
                    </div>
                  )}
                </div>
                {version.markdown ? (
                  <Link className="neu-btn inline-flex h-9 items-center rounded-xl px-4 text-sm" href={`/api/reports/${currentReport.id}/markdown?version=${version.version}`}>
                    导出 v{version.version} Markdown
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
