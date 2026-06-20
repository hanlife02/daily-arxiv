import { describe, expect, it, vi } from "vitest";
import { createReportMarkdownDownloadHandler } from "@/lib/app/report-markdown-download";

function routeParams(id = "report-1") {
  return { params: Promise.resolve({ id }) };
}

describe("report markdown download route handler", () => {
  it("downloads the latest owned report version by default", async () => {
    const findReport = vi.fn().mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      batchDate: "2026-06-20",
      latestVersion: 2
    });
    const findVersion = vi.fn().mockResolvedValue({
      version: 2,
      markdown: "# Daily report v2"
    });
    const handler = createReportMarkdownDownloadHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      findReport,
      findVersion
    });

    const response = await handler(new Request("http://localhost/api/reports/report-1/markdown"), routeParams());

    expect(findReport).toHaveBeenCalledWith("report-1", "user-1");
    expect(findVersion).toHaveBeenCalledWith("report-1", 2);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="daily-arxiv-2026-06-20-v2.md"');
    expect(await response.text()).toBe("# Daily report v2");
  });

  it("downloads an explicit owned report version", async () => {
    const findVersion = vi.fn().mockResolvedValue({ version: 1, markdown: "# Daily report v1" });
    const handler = createReportMarkdownDownloadHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      findReport: vi.fn().mockResolvedValue({
        id: "report-1",
        userId: "user-1",
        batchDate: "2026-06-20",
        latestVersion: 2
      }),
      findVersion
    });

    const response = await handler(new Request("http://localhost/api/reports/report-1/markdown?version=1"), routeParams());

    expect(findVersion).toHaveBeenCalledWith("report-1", 1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("# Daily report v1");
  });

  it("does not reveal reports outside the current user scope", async () => {
    const findVersion = vi.fn();
    const handler = createReportMarkdownDownloadHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      findReport: vi.fn().mockResolvedValue(null),
      findVersion
    });

    const response = await handler(new Request("http://localhost/api/reports/report-2/markdown"), routeParams("report-2"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(findVersion).not.toHaveBeenCalled();
  });

  it("rejects invalid requested versions before loading markdown", async () => {
    const findVersion = vi.fn();
    const handler = createReportMarkdownDownloadHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      findReport: vi.fn().mockResolvedValue({
        id: "report-1",
        userId: "user-1",
        batchDate: "2026-06-20",
        latestVersion: 2
      }),
      findVersion
    });

    const response = await handler(new Request("http://localhost/api/reports/report-1/markdown?version=abc"), routeParams());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid report version" });
    expect(findVersion).not.toHaveBeenCalled();
  });
});
