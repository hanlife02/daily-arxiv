import { Queue } from "bullmq";

export const redisConnection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};

export type CrawlJobData = {
  maxResultsPerCategory?: number;
  requestedBy?: string;
};

export type ReportJobData = {
  batchDate?: string;
  userId?: string;
  requestedBy?: string;
};

export type EmailJobData = {
  reportId: string;
  requestedBy?: string;
};

export type BackupJobData = {
  requestedBy?: string;
};

export type RetentionJobData = {
  requestedBy?: string;
};

let crawlQueue: Queue<CrawlJobData> | undefined;
let reportQueue: Queue<ReportJobData> | undefined;
let emailQueue: Queue<EmailJobData> | undefined;
let backupQueue: Queue<BackupJobData> | undefined;
let retentionQueue: Queue<RetentionJobData> | undefined;

export function getCrawlQueue() {
  crawlQueue ??= new Queue<CrawlJobData>("arxiv-crawl", { connection: redisConnection });
  return crawlQueue;
}

export function getReportQueue() {
  reportQueue ??= new Queue<ReportJobData>("report-generation", { connection: redisConnection });
  return reportQueue;
}

export function getEmailQueue() {
  emailQueue ??= new Queue<EmailJobData>("email-notification", { connection: redisConnection });
  return emailQueue;
}

export function getBackupQueue() {
  backupQueue ??= new Queue<BackupJobData>("backup", { connection: redisConnection });
  return backupQueue;
}

export function getRetentionQueue() {
  retentionQueue ??= new Queue<RetentionJobData>("data-retention", { connection: redisConnection });
  return retentionQueue;
}
