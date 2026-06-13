import { z } from "zod";

export const paperSummarySchema = z.object({
  title_original: z.string().min(1),
  title_zh: z.string().min(1),
  abstract_original: z.string().min(1),
  abstract_zh: z.string().min(1),
  one_sentence_summary_zh: z.string().min(1).max(30),
  summary_zh: z.string().min(1)
});

export type PaperSummary = z.infer<typeof paperSummarySchema>;

export function parsePaperSummaryResponse(raw: unknown) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  return paperSummarySchema.parse(payload);
}
