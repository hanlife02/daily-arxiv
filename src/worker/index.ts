import { Worker } from "bullmq";
import { bootstrapApplication } from "@/lib/app/bootstrap";
import { crawlSubscribedCategories } from "@/lib/app/papers";
import { defaultBatchDate, generateAndStoreDailyReport, generateReportsForAllUsers } from "@/lib/app/reports";
import { sendLatestReportEmail } from "@/lib/app/notifications";
import { getAdminSettings } from "@/lib/app/settings";
import { createDatabaseBackup } from "@/lib/app/backups";
import { applyDataRetention } from "@/lib/app/retention";
import { enqueueEmailJob, runLoggedJob } from "@/lib/app/jobs";
import { redisConnection } from "@/lib/jobs/queues";
import { startSchedulers } from "@/worker/scheduler";
import { startWorkerHeartbeat } from "@/lib/app/worker-health";

await bootstrapApplication();
const stopHeartbeat = startWorkerHeartbeat();

const workers = [
  new Worker(
    "arxiv-crawl",
    (job) => runLoggedJob("arxiv-crawl", job, async () => {
      const settings = await getAdminSettings();
      const maxResults = Number(job.data?.maxResultsPerCategory ?? settings.arxivMaxResultsPerCategory);
      return crawlSubscribedCategories(maxResults);
    }, (result) => `Crawled ${result.categories.length} categories`),
    { connection: redisConnection }
  ),
  new Worker(
    "report-generation",
    (job) => runLoggedJob("report-generation", job, async () => {
      const batchDate = String(job.data?.batchDate ?? defaultBatchDate());
      const userId = job.data?.userId ? String(job.data.userId) : "";
      if (userId) {
        const result = await generateAndStoreDailyReport(userId, batchDate, false);
        if (result.status === "succeeded" && result.reportId && result.selectedCount > 0) {
          await enqueueEmailJob({ reportId: result.reportId, requestedBy: "report-generation" });
        }
        return result;
      }

      const results = await generateReportsForAllUsers(batchDate, false);
      for (const item of results) {
        const result = item.result;
        if (result.status === "succeeded" && result.reportId && result.selectedCount > 0) {
          await enqueueEmailJob({ reportId: result.reportId, requestedBy: "report-generation" });
        }
      }
      return results;
    }, () => "Generated reports and queued eligible emails"),
    { connection: redisConnection }
  ),
  new Worker(
    "email-notification",
    (job) => runLoggedJob("email-notification", job, async () => {
      const reportId = String(job.data?.reportId ?? "");
      if (!reportId) throw new Error("reportId is required");
      return sendLatestReportEmail(reportId);
    }, (result) => result.sent ? "Sent report email" : `Email not sent: ${result.reason}`),
    { connection: redisConnection }
  ),
  new Worker(
    "backup",
    (job) => runLoggedJob("backup", job, () => createDatabaseBackup(), (result) => `Created backup ${result.sqlPath}`),
    { connection: redisConnection }
  ),
  new Worker(
    "data-retention",
    (job) => runLoggedJob("data-retention", job, () => applyDataRetention(), (result) =>
      `Applied data retention: job ${result.deletedJobLogs}, email ${result.deletedEmailLogs}, llm ${result.deletedLlmCallLogs}, pdf ${result.clearedPdfText}`
    ),
    { connection: redisConnection }
  )
];

startSchedulers();

process.on("SIGTERM", async () => {
  stopHeartbeat();
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
});
