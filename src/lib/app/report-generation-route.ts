import { stringFromForm } from "@/lib/app/forms";
import { redirectToApp } from "@/lib/app/http";

export type ReportGenerationUser = {
  id: string;
};

export type ReportGenerationJobInput = {
  batchDate: string;
  userId?: string;
  requestedBy: string;
};

export type ReportGenerationJobResult = {
  jobId: string;
};

export type UserReportGenerationDependencies = {
  requireUser: () => Promise<ReportGenerationUser>;
  enqueueReportJob: (input: ReportGenerationJobInput) => Promise<ReportGenerationJobResult>;
  defaultBatchDate?: () => string;
};

export type AdminReportGenerationDependencies = {
  requireAdmin: () => Promise<ReportGenerationUser>;
  enqueueReportJob: (input: ReportGenerationJobInput) => Promise<ReportGenerationJobResult>;
  defaultBatchDate?: () => string;
};

function defaultReportGenerationBatchDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function createUserReportGenerationHandler(deps: UserReportGenerationDependencies) {
  return async function post(request: Request) {
    const user = await deps.requireUser();
    const form = await request.formData();
    const batchDate = stringFromForm(form.get("batchDate"), (deps.defaultBatchDate ?? defaultReportGenerationBatchDate)());
    const job = await deps.enqueueReportJob({
      batchDate,
      userId: user.id,
      requestedBy: user.id
    });
    return redirectToApp(`/reports?job=${encodeURIComponent(job.jobId)}`, request);
  };
}

export function createAdminReportGenerationHandler(deps: AdminReportGenerationDependencies) {
  return async function post(request: Request) {
    const user = await deps.requireAdmin();
    const form = await request.formData();
    const batchDate = stringFromForm(form.get("batchDate"), (deps.defaultBatchDate ?? defaultReportGenerationBatchDate)());
    const userId = stringFromForm(form.get("userId"));

    try {
      const job = await deps.enqueueReportJob({
        batchDate,
        userId: userId || undefined,
        requestedBy: user.id
      });
      return redirectToApp(`/admin?job=${encodeURIComponent(job.jobId)}`, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enqueue report job";
      return redirectToApp(`/admin?error=${encodeURIComponent(message)}`, request);
    }
  };
}
