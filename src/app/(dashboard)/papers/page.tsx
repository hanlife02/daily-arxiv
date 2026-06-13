import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const samplePapers = [
  {
    id: "2501.12345",
    title: "A Minimal Baseline for Scientific Paper Recommendation",
    categories: "cs.CL, stat.ML",
    status: "待总结"
  },
  {
    id: "2501.12346",
    title: "Efficient Retrieval Augmentation for Research Agents",
    categories: "cs.AI",
    status: "未收藏"
  }
];

export default function PapersPage() {
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
                {samplePapers.map((paper) => (
                  <tr key={paper.id} className="border-t border-border/40">
                    <td className="py-3 pr-4 font-mono">{paper.id}</td>
                    <td className="py-3 pr-4">{paper.title}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{paper.categories}</td>
                    <td className="py-3 pr-4">{paper.status}</td>
                    <td className="py-3 text-right">
                      <Button variant="secondary">总结</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
