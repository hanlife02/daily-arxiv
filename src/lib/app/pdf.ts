import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper } from "@/lib/db/schema";

const PDF_FETCH_TIMEOUT_MS = 30_000;
export const MAX_PDF_CACHE_CHARS = 120_000;
export const MAX_PDF_PROMPT_CHARS = 80_000;

type PaperRow = typeof paper.$inferSelect;

export async function loadPaperPdfText(row: PaperRow) {
  if (row.pdfText) {
    return { text: row.pdfText.slice(0, MAX_PDF_CACHE_CHARS), source: "cache" as const };
  }
  if (!row.pdfUrl) {
    return { text: "", source: "missing" as const, error: "PDF URL missing" };
  }

  try {
    const res = await fetch(row.pdfUrl, {
      signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS)
    });
    if (!res.ok) {
      return { text: "", source: "failed" as const, error: `PDF download failed: ${res.status}` };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text.slice(0, MAX_PDF_CACHE_CHARS);
    await db.update(paper).set({ pdfText: text }).where(eq(paper.arxivId, row.arxivId));
    return { text, source: "downloaded" as const };
  } catch (error) {
    return {
      text: "",
      source: "failed" as const,
      error: error instanceof Error ? error.message : "PDF parse failed"
    };
  }
}
