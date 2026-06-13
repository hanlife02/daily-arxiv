import { Queue } from "bullmq";

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};

export const crawlQueue = new Queue("arxiv-crawl", { connection });
export const reportQueue = new Queue("report-generation", { connection });
export const emailQueue = new Queue("email-notification", { connection });
