import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/app/authz";
import { db } from "@/lib/db";
import { paper, userPaperState, userPreference } from "@/lib/db/schema";

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
        <CardHeader>
          <CardTitle>论文列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 font-medium">arXiv ID</th>
                  <th className="pb-3 pr-4 font-medium">标题</th>
                  <th className="pb-3 pr-4 font-medium">板块</th>
                  <th className="pb-3 pr-4 font-medium">状态</th>
                  <th className="pb-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((item) => (
                  <tr key={item.arxivId} className="border-t border-border/40">
                    <td className="py-3 pr-4 font-mono">{item.arxivId}</td>
                    <td className="py-3 pr-4">
                      <a className="hover:underline" href={item.arxivUrl} target="_blank" rel="noreferrer">{item.title}</a>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{item.categories.join(", ")}</td>
                    <td className="py-3 pr-4">{stateByPaper.get(item.arxivId)?.favorited ? "已收藏" : "未收藏"}</td>
                    <td className="py-3 text-right">
                      <form action="/api/papers/favorite" method="post">
                        <input type="hidden" name="paperId" value={item.arxivId} />
                        <input type="hidden" name="favorited" value={stateByPaper.get(item.arxivId)?.favorited ? "false" : "true"} />
                        <Button type="submit" variant="secondary">
                          {stateByPaper.get(item.arxivId)?.favorited ? "取消收藏" : "收藏"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {papers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">暂无论文。请先保存订阅，并由管理员触发抓取任务。</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
