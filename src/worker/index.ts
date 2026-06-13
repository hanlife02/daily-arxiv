import { Worker } from "bullmq";

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};

const workers = [
  new Worker(
    "arxiv-crawl",
    async (job) => {
      console.log(`crawl job received: ${job.id}`);
    },
    { connection }
  ),
  new Worker(
    "report-generation",
    async (job) => {
      console.log(`report job received: ${job.id}`);
    },
    { connection }
  ),
  new Worker(
    "email-notification",
    async (job) => {
      console.log(`email job received: ${job.id}`);
    },
    { connection }
  )
];

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
});
