ALTER TABLE "user" ADD COLUMN "manual_llm_calls_per_user_per_day_override" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "concurrent_manual_llm_calls_per_user_override" integer;
