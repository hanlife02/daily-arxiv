import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ARXIV_CATEGORIES } from "@/lib/arxiv/categories";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">个人设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">配置长期保存的订阅、排序规则、LLM 和邮件通知。</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>arXiv 订阅</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="grid gap-1.5 text-sm">
              Categories
              <textarea className="neu-input min-h-24 p-3 text-sm" placeholder="cs.CL, stat.ML" />
            </label>
            <p className="text-xs text-muted-foreground">内置 {ARXIV_CATEGORIES.length} 个常用板块，保存时会校验 code。</p>
            <Button>保存订阅</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>日报偏好</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              Top N
              <input className="neu-input h-10 px-3 text-sm" type="number" min={1} max={10} defaultValue={5} />
            </label>
            <label className="grid gap-1.5 text-sm">
              推送时间
              <input className="neu-input h-10 px-3 text-sm" type="time" defaultValue="09:00" />
            </label>
            <label className="grid gap-1.5 text-sm">
              时区
              <input className="neu-input h-10 px-3 text-sm" defaultValue="Asia/Shanghai" />
            </label>
            <Button>保存偏好</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM 配置</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <input className="neu-input h-10 px-3 text-sm" placeholder="Base URL，例如 https://api.openai.com" />
            <input className="neu-input h-10 px-3 text-sm" placeholder="API Key，保存后不回显" type="password" />
            <input className="neu-input h-10 px-3 text-sm" placeholder="Model，例如 gpt-4.1-mini" />
            <Button>保存模型配置</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>日报发件 SMTP</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <input className="neu-input h-10 px-3 text-sm" placeholder="SMTP Host" />
            <input className="neu-input h-10 px-3 text-sm" placeholder="SMTP User" />
            <input className="neu-input h-10 px-3 text-sm" placeholder="SMTP Password" type="password" />
            <Button>保存 SMTP</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
