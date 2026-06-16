import { requireApiUser } from "@/lib/app/authz";
import { crawlSubscribedCategories } from "@/lib/app/papers";
import { getAdminSettings } from "@/lib/app/settings";

export async function POST() {
  await requireApiUser();
  const settings = await getAdminSettings();
  try {
    const result = await crawlSubscribedCategories(settings.arxivMaxResultsPerCategory);
    return Response.json({
      ok: true,
      message: `成功抓取 ${result.categories.length} 个板块`,
      categories: result.categories
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "抓取失败" },
      { status: 500 }
    );
  }
}
