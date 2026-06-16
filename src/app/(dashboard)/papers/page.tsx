import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/app/authz";
import { db } from "@/lib/db";
import { paper, userPaperState, userPreference } from "@/lib/db/schema";
import { PaperTable } from "@/components/arxiv/paper-table";
import { CrawlButton } from "@/components/arxiv/crawl-button";

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  const user = await requireUser();
  const preference = await db.query.userPreference.findFirst({
    where: eq(userPreference.userId, user.id)
  });
  const rows = preference?.categories.length
    ? await db.select().from(paper).orderBy(desc(paper.publishedAt)).limit(200)
    : [];
  const states = await db.query.userPaperState.findMany({
    where: eq(userPaperState.userId, user.id)
  });
  const stateByPaper = new Map(states.map((state) => [state.paperId, state]));
  const papers = rows
    .filter((item) => item.categories.some((category) => preference?.categories.includes(category)))
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
        <CardContent>
          <PaperTable papers={papers} states={stateByPaper} />
          {papers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">暂无论文。请先保存订阅，然后点击「手动抓取」获取最新论文。</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
