export type ReportMarkdownDownloadUser = {
  id: string;
};

export type ReportMarkdownDownloadReport = {
  id: string;
  batchDate: string;
  latestVersion: number;
};

export type ReportMarkdownDownloadVersion = {
  version: number;
  markdown: string;
};

export type ReportMarkdownDownloadDependencies = {
  requireUser: () => Promise<ReportMarkdownDownloadUser>;
  findReport: (reportId: string, userId: string) => Promise<ReportMarkdownDownloadReport | null | undefined>;
  findVersion: (reportId: string, version: number) => Promise<ReportMarkdownDownloadVersion | null | undefined>;
};

export function requestedReportMarkdownVersion(request: Request, latestVersion: number) {
  const raw = new URL(request.url).searchParams.get("version");
  if (!raw) return latestVersion;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createReportMarkdownDownloadHandler(deps: ReportMarkdownDownloadDependencies) {
  return async function get(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await deps.requireUser();
    const { id } = await params;
    const currentReport = await deps.findReport(id, user.id);
    if (!currentReport) return new Response("Not found", { status: 404 });

    const versionNumber = requestedReportMarkdownVersion(request, currentReport.latestVersion);
    if (!versionNumber) {
      return Response.json({ ok: false, error: "Invalid report version" }, { status: 400 });
    }

    const version = await deps.findVersion(currentReport.id, versionNumber);
    if (!version) return new Response("Not found", { status: 404 });

    return new Response(version.markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="daily-arxiv-${currentReport.batchDate}-v${version.version}.md"`
      }
    });
  };
}
