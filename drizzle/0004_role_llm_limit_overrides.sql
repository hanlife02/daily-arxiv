ALTER TABLE "admin_setting" ADD COLUMN "user_role_manual_llm_calls_per_user_per_day" integer;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "user_role_concurrent_manual_llm_calls_per_user" integer;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "admin_role_manual_llm_calls_per_user_per_day" integer;--> statement-breakpoint
ALTER TABLE "admin_setting" ADD COLUMN "admin_role_concurrent_manual_llm_calls_per_user" integer;
