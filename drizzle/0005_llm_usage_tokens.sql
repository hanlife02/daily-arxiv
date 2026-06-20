ALTER TABLE "llm_call_log" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD COLUMN "total_tokens" integer;
