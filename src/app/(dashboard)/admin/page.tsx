import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const checks = ["公开健康检查", "数据库", "Redis", "Worker heartbeat", "SMTP", "备份"];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理员后台</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理注册后缀、通知 fallback、限流、任务日志和健康状态。</p>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>系统健康</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {checks.map((check) => (
              <div key={check} className="neu-inset flex items-center justify-between rounded-xl px-4 py-2.5 text-sm">
                <span>{check}</span>
                <span className="text-muted-foreground">待接入</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>通知策略</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">全局 Notification SMTP fallback、每日邮件上限、重试次数和用户通知禁用在这里配置。</p>
            <Button>保存策略</Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
