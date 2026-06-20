ALTER TABLE "admin_setting" ADD COLUMN "log_retention_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "pdf_text_retention_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "backup_retention_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_paper_state" ADD COLUMN "ignored" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_paper_state" ADD COLUMN "recommended_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "paper_metric" (
	"arxiv_id" text PRIMARY KEY NOT NULL,
	"avg_h_index" real DEFAULT 0 NOT NULL,
	"strong_author_count" integer DEFAULT 0 NOT NULL,
	"peak_h_index" integer DEFAULT 0 NOT NULL,
	"references_count" integer DEFAULT 0 NOT NULL,
	"s2_status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "llm_call_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"paper_id" text,
	"report_id" text,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"prompt_chars" integer DEFAULT 0 NOT NULL,
	"completion_chars" integer DEFAULT 0 NOT NULL,
	"used_pdf_text" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "paper_metric" ADD CONSTRAINT "paper_metric_arxiv_id_paper_arxiv_id_fk" FOREIGN KEY ("arxiv_id") REFERENCES "public"."paper"("arxiv_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_paper_id_paper_arxiv_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."paper"("arxiv_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_call_log_user_created_idx" ON "llm_call_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_call_log_endpoint_created_idx" ON "llm_call_log" USING btree ("endpoint","created_at");
