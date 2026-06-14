import { randomUUID } from "node:crypto";
import { requireApiAdmin } from "@/lib/app/authz";
import { redirectToApp } from "@/lib/app/http";
import { crawlSubscribedCategories } from "@/lib/app/papers";
import { getAdminSettings } from "@/lib/app/settings";
import { db } from "@/lib/db";
import { jobLog } from "@/lib/db/schema";

export async function POST(request: Request) {
  await requireApiAdmin();
  const settings = await getAdminSettings();
  try {
    const result = await crawlSubscribedCategories(settings.arxivMaxResultsPerCategory);
    await db.insert(jobLog).values({
      id: randomUUID(),
      type: "arxiv-crawl",
      status: "succeeded",
      message: `Crawled ${result.categories.length} categories`,
      metadata: result
    });
    return redirectToApp("/admin?job=crawl", request);
  } catch (error) {
    await db.insert(jobLog).values({
      id: randomUUID(),
      type: "arxiv-crawl",
      status: "failed",
      message: error instanceof Error ? error.message : "Crawl failed",
      metadata: {}
    });
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Crawl failed" }, { status: 500 });
  }
}
