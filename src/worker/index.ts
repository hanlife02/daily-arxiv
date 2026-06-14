import { Worker } from "bullmq";
import { bootstrapApplication } from "@/lib/app/bootstrap";
import { crawlSubscribedCategories } from "@/lib/app/papers";
import { defaultBatchDate, generateAndStoreDailyReport, generateReportsForAllUsers } from "@/lib/app/reports";
import { sendLatestReportEmail } from "@/lib/app/notifications";
import { getAdminSettings } from "@/lib/app/settings";

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};

await bootstrapApplication();

const workers = [
  new Worker(
    "arxiv-crawl",
    async (job) => {
      const settings = await getAdminSettings();
      const maxResults = Number(job.data?.maxResultsPerCategory ?? settings.arxivMaxResultsPerCategory);
      return crawlSubscribedCategories(maxResults);
    },
    { connection }
  ),
  new Worker(
    "report-generation",
    async (job) => {
      const batchDate = String(job.data?.batchDate ?? defaultBatchDate());
      const userId = job.data?.userId ? String(job.data.userId) : "";
      return userId ? generateAndStoreDailyReport(userId, batchDate) : generateReportsForAllUsers(batchDate);
    },
    { connection }
  ),
  new Worker(
    "email-notification",
    async (job) => {
      const reportId = String(job.data?.reportId ?? "");
      if (!reportId) throw new Error("reportId is required");
      return sendLatestReportEmail(reportId);
    },
    { connection }
  )
];

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
});
