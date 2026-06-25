ALTER TABLE "admin_setting" ADD COLUMN "manual_llm_calls_per_user_per_day" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "concurrent_manual_llm_calls_per_user" integer DEFAULT 1 NOT NULL;
