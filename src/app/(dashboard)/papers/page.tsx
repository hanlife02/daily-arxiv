import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAppUser } from "@/lib/app/authz";
import { db } from "@/lib/db";
import { userPaperState, userPreference } from "@/lib/db/schema";
import { PaperTable } from "@/components/arxiv/paper-table";
import { CrawlButton } from "@/components/arxiv/crawl-button";
import { getRecentPapersForCategories } from "@/lib/app/papers";

export const dynamic = "force-dynamic";

type PapersPageProps = {
  searchParams?: Promise<{ status?: string; category?: string; from?: string }>;
};

function parseDateFilter(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function PapersPage({ searchParams }: PapersPageProps) {
  const user = await requireAppUser();
  const params = await searchParams;
  const status = params?.status ?? "all";
  const category = params?.category ?? "all";
  const fromDate = parseDateFilter(params?.from);
  const preference = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, user.id)
  });
  const rows = preference?.categories.length
    ? await getRecentPapersForCategories(preference.categories, new Date(0), 200)
    : [];
  const states = await db.query.userPaperState.findMany({
    where: eq(userPaperState.userId, user.id)
  });
  const stateByPaper = new Map(states.map((state) => [state.paperId, state]));
  const papers = rows
    .filter((item) => category === "all" || item.categories.includes(category))
    .filter((item) => !fromDate || item.publishedAt >= fromDate)
    .filter((item) => {
      const state = stateByPaper.get(item.arxivId);
      if (status === "favorite") return state?.favorited;
      if (status === "read") return state?.read;
      if (status === "unread") return !state?.read;
      if (status === "ignored") return state?.ignored;
      if (status === "recommended") return Boolean(state?.recommendedAt);
      return true;
    })
    .slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">论文池</h1>
        <p className="mt-1 text-sm text-muted-foreground">按用户 categories 从全局论文池筛选，支持收藏和手动总结。</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>论文列表</CardTitle>
          <CrawlButton />
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap gap-2" method="get">
            <select className="neu-input h-9 px-3 text-sm" name="status" defaultValue={status}>
              <option value="all">全部状态</option>
              <option value="favorite">已收藏</option>
              <option value="read">已读</option>
              <option value="unread">未读</option>
              <option value="ignored">已忽略</option>
              <option value="recommended">已推荐</option>
            </select>
            <select className="neu-input h-9 px-3 text-sm" name="category" defaultValue={category}>
              <option value="all">全部分类</option>
              {(preference?.categories ?? []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <input className="neu-input h-9 px-3 text-sm" name="from" type="date" defaultValue={params?.from ?? ""} />
            <Button type="submit" variant="secondary">筛选</Button>
          </form>
          <PaperTable papers={papers} states={stateByPaper} />
          {papers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">暂无论文。请先保存订阅，然后点击「手动抓取」获取最新论文。</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
