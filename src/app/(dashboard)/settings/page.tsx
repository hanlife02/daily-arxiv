import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/arxiv/category-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/app/authz";
import { ARXIV_CATEGORIES } from "@/lib/arxiv/categories";
import { db } from "@/lib/db";
import { userLlmConfig, userPreference, userSmtpConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [preference, llmConfig, smtpConfig] = await Promise.all([
    db.query.userPreference.findFirst({ where: eq(userPreference.userId, user.id) }),
    db.query.userLlmConfig.findFirst({ where: eq(userLlmConfig.userId, user.id) }),
    db.query.userSmtpConfig.findFirst({ where: eq(userSmtpConfig.userId, user.id) })
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">个人设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">配置长期保存的订阅、排序规则、LLM 和邮件通知。</p>
      </div>

      <SettingsTabs>
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>arXiv 订阅</CardTitle>
          </CardHeader>
          <CardContent as="form" action="/api/settings/preferences" method="post" className="space-y-3">
            <CategoryPicker categories={ARXIV_CATEGORIES} selected={preference?.categories ?? []} />
            <label className="grid gap-1.5 text-sm">
              包含关键词
              <input className="neu-input h-10 px-3 text-sm" name="includeKeywords" defaultValue={preference?.includeKeywords.join(", ") ?? ""} />
            </label>
            <label className="grid gap-1.5 text-sm">
              排除关键词
              <input className="neu-input h-10 px-3 text-sm" name="excludeKeywords" defaultValue={preference?.excludeKeywords.join(", ") ?? ""} />
            </label>
            <Button type="submit">保存订阅</Button>
          </CardContent>
        </Card>

        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>日报偏好</CardTitle>
          </CardHeader>
          <CardContent as="form" action="/api/settings/preferences" method="post" className="grid gap-3">
            <input type="hidden" name="categories" value={preference?.categories.join(", ") ?? ""} />
            <input type="hidden" name="includeKeywords" value={preference?.includeKeywords.join(", ") ?? ""} />
            <input type="hidden" name="excludeKeywords" value={preference?.excludeKeywords.join(", ") ?? ""} />
            <label className="grid gap-1.5 text-sm">
              Top N
              <input className="neu-input h-10 px-3 text-sm" name="topN" type="number" min={1} max={50} defaultValue={preference?.topN ?? 5} />
            </label>
            <label className="grid gap-1.5 text-sm">
              推送时间
              <input className="neu-input h-10 px-3 text-sm" name="sendTime" type="time" defaultValue={preference?.sendTime ?? "09:00"} />
            </label>
            <label className="grid gap-1.5 text-sm">
              时区
              <input className="neu-input h-10 px-3 text-sm" name="timezone" defaultValue={preference?.timezone ?? "Asia/Shanghai"} />
            </label>
            <label className="grid gap-1.5 text-sm">
              总结关注点
              <textarea className="neu-input min-h-24 p-3 text-sm" name="summaryFocus" defaultValue={preference?.summaryFocus ?? ""} />
            </label>
            <Button type="submit">保存偏好</Button>
          </CardContent>
        </Card>

        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>LLM 配置</CardTitle>
          </CardHeader>
          <CardContent as="form" action="/api/settings/llm" method="post" className="grid gap-3">
            <input className="neu-input h-10 px-3 text-sm" name="baseUrl" placeholder="Base URL，例如 https://api.openai.com" defaultValue={llmConfig?.baseUrl ?? ""} />
            <input className="neu-input h-10 px-3 text-sm" name="apiKey" placeholder="API Key，留空保持不变" type="password" />
            <input className="neu-input h-10 px-3 text-sm" name="model" placeholder="Model，例如 gpt-4.1-mini" defaultValue={llmConfig?.model ?? ""} />
            <Button type="submit">保存模型配置</Button>
          </CardContent>
        </Card>

        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>日报发件 SMTP</CardTitle>
          </CardHeader>
          <CardContent as="form" action="/api/settings/smtp" method="post" className="grid gap-3">
            <input className="neu-input h-10 px-3 text-sm" name="host" placeholder="SMTP Host" defaultValue={smtpConfig?.host ?? ""} />
            <input className="neu-input h-10 px-3 text-sm" name="port" placeholder="SMTP Port" type="number" defaultValue={smtpConfig?.port ?? 587} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input name="secure" type="checkbox" defaultChecked={smtpConfig?.secure ?? false} />
              使用 SMTPS
            </label>
            <input className="neu-input h-10 px-3 text-sm" name="from" placeholder="From，例如 Daily arXiv <me@example.com>" defaultValue={smtpConfig?.from ?? ""} />
            <input className="neu-input h-10 px-3 text-sm" name="username" placeholder="SMTP User" defaultValue={smtpConfig?.username ?? ""} />
            <input className="neu-input h-10 px-3 text-sm" name="password" placeholder="SMTP Password，留空保持不变" type="password" />
            <Button type="submit">保存 SMTP</Button>
          </CardContent>
        </Card>
      </SettingsTabs>
    </div>
  );
}
