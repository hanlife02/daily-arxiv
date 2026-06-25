import { describe, expect, it, vi } from "vitest";
import { createAdminReportGenerationHandler, createUserReportGenerationHandler } from "@/lib/app/report-generation-route";

function postRequest(body: URLSearchParams, url = "http://localhost/api/reports/generate") {
  return new Request(url, {
    method: "POST",
    body
  });
}

describe("user report generation route handler", () => {
  it("enqueues a report job for the current user and redirects to reports", async () => {
    const enqueueReportJob = vi.fn().mockResolvedValue({ jobId: "job-123" });
    const handler = createUserReportGenerationHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      enqueueReportJob,
      defaultBatchDate: () => "2026-06-19"
    });

    const response = await handler(postRequest(new URLSearchParams({ batchDate: "2026-06-20" })));

    expect(enqueueReportJob).toHaveBeenCalledWith({
      batchDate: "2026-06-20",
      userId: "user-1",
      requestedBy: "user-1"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/reports?job=job-123");
  });

  it("uses the default batch date when the form value is missing", async () => {
    const enqueueReportJob = vi.fn().mockResolvedValue({ jobId: "job-default" });
    const handler = createUserReportGenerationHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      enqueueReportJob,
      defaultBatchDate: () => "2026-06-19"
    });

    const response = await handler(postRequest(new URLSearchParams()));

    expect(enqueueReportJob).toHaveBeenCalledWith({
      batchDate: "2026-06-19",
      userId: "user-1",
      requestedBy: "user-1"
    });
    expect(response.headers.get("location")).toBe("http://localhost/reports?job=job-default");
  });

  it("does not swallow queue errors so the API wrapper can handle them", async () => {
    const handler = createUserReportGenerationHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      enqueueReportJob: vi.fn().mockRejectedValue(new Error("queue unavailable")),
      defaultBatchDate: () => "2026-06-19"
    });

    await expect(handler(postRequest(new URLSearchParams()))).rejects.toThrow("queue unavailable");
  });
});

describe("admin report generation route handler", () => {
  it("enqueues a report job for a selected user and redirects to admin", async () => {
    const enqueueReportJob = vi.fn().mockResolvedValue({ jobId: "admin-job-1" });
    const handler = createAdminReportGenerationHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      enqueueReportJob,
      defaultBatchDate: () => "2026-06-19"
    });

    const response = await handler(postRequest(
      new URLSearchParams({ batchDate: "2026-06-20", userId: "user-2" }),
      "http://localhost/api/admin/reports/generate"
    ));

    expect(enqueueReportJob).toHaveBeenCalledWith({
      batchDate: "2026-06-20",
      userId: "user-2",
      requestedBy: "admin-1"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin?job=admin-job-1");
  });

  it("omits userId for an all-user admin report job", async () => {
    const enqueueReportJob = vi.fn().mockResolvedValue({ jobId: "admin-job-all" });
    const handler = createAdminReportGenerationHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      enqueueReportJob,
      defaultBatchDate: () => "2026-06-19"
    });

    const response = await handler(postRequest(
      new URLSearchParams({ userId: "  " }),
      "http://localhost/api/admin/reports/generate"
    ));

    expect(enqueueReportJob).toHaveBeenCalledWith({
      batchDate: "2026-06-19",
      userId: undefined,
      requestedBy: "admin-1"
    });
    expect(response.headers.get("location")).toBe("http://localhost/admin?job=admin-job-all");
  });

  it("redirects queue errors back to admin with the error message", async () => {
    const handler = createAdminReportGenerationHandler({
      requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
      enqueueReportJob: vi.fn().mockRejectedValue(new Error("queue unavailable")),
      defaultBatchDate: () => "2026-06-19"
    });

    const response = await handler(postRequest(new URLSearchParams(), "http://localhost/api/admin/reports/generate"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/admin?error=queue%20unavailable");
  });
});
