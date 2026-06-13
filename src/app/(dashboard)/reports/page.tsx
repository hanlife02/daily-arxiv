import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">日报历史</h1>
          <p className="mt-1 text-sm text-muted-foreground">日报长期保存，重生成会保留历史版本，默认展示最新版。</p>
        </div>
        <Button>重新生成当前批次</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>暂无日报</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          保存订阅并完成首次抓取后，这里会展示日报版本、生成状态和邮件状态。
        </CardContent>
      </Card>
    </div>
  );
}
