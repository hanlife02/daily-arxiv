import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    disabled: boolean("disabled").notNull().default(false),
    notificationDisabled: boolean("notification_disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_idx").on(table.email)
  })
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_idx").on(table.token),
    userIdIdx: index("session_user_id_idx").on(table.userId)
  })
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId)
  })
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const allowedEmailDomain = pgTable("allowed_email_domain", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  includeKeywords: jsonb("include_keywords").$type<string[]>().notNull().default([]),
  excludeKeywords: jsonb("exclude_keywords").$type<string[]>().notNull().default([]),
  categoryWeights: jsonb("category_weights").$type<Record<string, number>>().notNull().default({}),
  topN: integer("top_n").notNull().default(5),
  sendTime: text("send_time").notNull().default("09:00"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  summaryFocus: text("summary_focus"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const userLlmConfig = pgTable("user_llm_config", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const userSmtpConfig = pgTable("user_smtp_config", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: boolean("secure").notNull().default(false),
  from: text("from").notNull(),
  username: text("username"),
  encryptedPassword: text("encrypted_password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const adminNotificationSmtpConfig = pgTable("admin_notification_smtp_config", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: boolean("secure").notNull().default(false),
  from: text("from").notNull(),
  username: text("username"),
  encryptedPassword: text("encrypted_password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const adminSetting = pgTable("admin_setting", {
  id: text("id").primaryKey(),
  notificationFallbackEnabled: boolean("notification_fallback_enabled").notNull().default(false),
  dailyEmailLimit: integer("daily_email_limit").notNull().default(10),
  emailRetryCount: integer("email_retry_count").notNull().default(2),
  arxivMaxResultsPerCategory: integer("arxiv_max_results_per_category").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const paper = pgTable(
  "paper",
  {
    arxivId: text("arxiv_id").primaryKey(),
    latestVersion: text("latest_version").notNull().default("v1"),
    title: text("title").notNull(),
    abstract: text("abstract").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull().default([]),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    primaryCategory: text("primary_category").notNull(),
    arxivUrl: text("arxiv_url").notNull(),
    pdfUrl: text("pdf_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    pdfText: text("pdf_text")
  },
  (table) => ({
    publishedIdx: index("paper_published_idx").on(table.publishedAt),
    primaryCategoryIdx: index("paper_primary_category_idx").on(table.primaryCategory)
  })
);

export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    batchDate: text("batch_date").notNull(),
    status: text("status").notNull(),
    emailStatus: text("email_status").notNull().default("pending"),
    reason: text("reason"),
    latestVersion: integer("latest_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userBatchIdx: uniqueIndex("report_user_batch_idx").on(table.userId, table.batchDate)
  })
);

export const reportVersion = pgTable(
  "report_version",
  {
    id: text("id").primaryKey(),
    reportId: text("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    selectedPaperIds: jsonb("selected_paper_ids").$type<string[]>().notNull().default([]),
    markdown: text("markdown").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version").notNull().default("daily-arxiv-v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    reportVersionIdx: uniqueIndex("report_version_idx").on(table.reportId, table.version)
  })
);

export const paperSummary = pgTable(
  "paper_summary",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id")
      .notNull()
      .references(() => paper.arxivId, { onDelete: "cascade" }),
    titleOriginal: text("title_original").notNull(),
    titleZh: text("title_zh").notNull(),
    abstractOriginal: text("abstract_original").notNull(),
    abstractZh: text("abstract_zh").notNull(),
    oneSentenceSummaryZh: text("one_sentence_summary_zh").notNull(),
    summaryZh: text("summary_zh").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    rawResponse: jsonb("raw_response").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userPaperIdx: index("paper_summary_user_paper_idx").on(table.userId, table.paperId)
  })
);

export const userPaperState = pgTable(
  "user_paper_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paperId: text("paper_id")
      .notNull()
      .references(() => paper.arxivId, { onDelete: "cascade" }),
    favorited: boolean("favorited").notNull().default(false),
    read: boolean("read").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.paperId] })
  })
);

export const emailLog = pgTable("email_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const jobLog = pgTable("job_log", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  preference: one(userPreference),
  reports: many(report),
  summaries: many(paperSummary)
}));
