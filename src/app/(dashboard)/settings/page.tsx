import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/arxiv/category-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/app/authz";
import { ARXIV_CATEGORIES } from "@/lib/arxiv/categories";
import { db } from "@/lib/db";
import { userLlmConfig, userPreference, userSmtpConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
    imported?: string;
    skipped?: string;
    overwritePreference?: string;
    overwriteStates?: string;
    createStates?: string;
    preferenceFields?: string;
    changedStates?: string;
  }>;
};

type PreferenceValues = {
  categories: string[];
  categoryWeights: Record<string, number>;
  includeKeywords: string[];
  excludeKeywords: string[];
  topN: number;
  sendTime: string;
  timezone: string;
  summaryFocus: string;
};

type PreferenceHiddenField = keyof PreferenceValues | "categoryWeights";

function PreferenceHiddenFields({ values, omit = [] }: { values: PreferenceValues; omit?: PreferenceHiddenField[] }) {
  const omitted = new Set<PreferenceHiddenField>(omit);

  return (
    <>
      {!omitted.has("categories") && <input type="hidden" name="categories" value={values.categories.join(", ")} />}
      {!omitted.has("categoryWeights") &&
        values.categories.map((category) => (
          <input key={category} type="hidden" name={`categoryWeight:${category}`} value={values.categoryWeights[category] ?? 1} />
        ))}
      {!omitted.has("includeKeywords") && (
        <input type="hidden" name="includeKeywords" value={values.includeKeywords.join(", ")} />
      )}
      {!omitted.has("excludeKeywords") && (
        <input type="hidden" name="excludeKeywords" value={values.excludeKeywords.join(", ")} />
      )}
      {!omitted.has("topN") && <input type="hidden" name="topN" value={values.topN} />}
      {!omitted.has("sendTime") && <input type="hidden" name="sendTime" value={values.sendTime} />}
      {!omitted.has("timezone") && <input type="hidden" name="timezone" value={values.timezone} />}
      {!omitted.has("summaryFocus") && <input type="hidden" name="summaryFocus" value={values.summaryFocus} />}
    </>
  );
}

function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="max-w-5xl">
      <CardHeader className="border-b border-border/60">
        <CardTitle>{title}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      {children}
    </Card>
  );
}

function importDetailLabel(input: {
  skipped?: string;
  overwritePreference?: string;
  overwriteStates?: string;
  createStates?: string;
  preferenceFields?: string;
  changedStates?: string;
}) {
  const skippedCount = Number(input.skipped);
  const overwriteStates = Number(input.overwriteStates);
  const createStates = Number(input.createStates);
  const changedStates = Number(input.changedStates);
  const details = [
    input.overwritePreference === "1" ? "会覆盖现有偏好" : "",
    input.preferenceFields ? `偏好字段：${input.preferenceFields}` : "",
    Number.isFinite(overwriteStates) && overwriteStates > 0
      ? `覆盖 ${overwriteStates} 条已有阅读状态${Number.isFinite(changedStates) ? `，其中 ${changedStates} 条会变化` : ""}`
      : "",
    Number.isFinite(createStates) && createStates > 0 ? `新增 ${createStates} 条阅读状态` : "",
    Number.isFinite(skippedCount) && skippedCount > 0 ? `跳过 ${skippedCount} 篇当前实例中不存在的论文` : ""
  ].filter(Boolean);
  return details.length ? `（${details.join("，")}）` : "";
}

function settingsSavedLabel(
  saved?: string,
  imported?: string,
  input: {
    skipped?: string;
    overwritePreference?: string;
    overwriteStates?: string;
    createStates?: string;
    preferenceFields?: string;
    changedStates?: string;
  } = {}
) {
  if (saved === "preferences") return "偏好设置已保存。";
  if (saved === "llm") return "模型配置已保存。";
  if (saved === "smtp") return "SMTP 配置已保存。";
  if (saved === "import-preview") {
    return `个人数据导入预览：将导入 ${imported || "可导入数据"}${importDetailLabel(input)}。`;
  }
  if (saved === "import") {
    return `个人数据导入完成：${imported || "已处理可导入数据"}${importDetailLabel(input)}。`;
  }
  return "";
}

function SettingsNotice({
  saved,
  error,
  imported,
  skipped,
  overwritePreference,
  overwriteStates,
  createStates,
  preferenceFields,
  changedStates
}: {
  saved?: string;
  error?: string;
  imported?: string;
  skipped?: string;
  overwritePreference?: string;
  overwriteStates?: string;
  createStates?: string;
  preferenceFields?: string;
  changedStates?: string;
}) {
  const savedLabel = settingsSavedLabel(saved, imported, {
    skipped,
    overwritePreference,
    overwriteStates,
    createStates,
    preferenceFields,
    changedStates
  });
  if (error) {
    return (
      <div className="max-w-5xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
        保存失败：{error.slice(0, 200)}
      </div>
    );
  }
  if (savedLabel) {
    return (
      <div className="max-w-5xl rounded-xl border border-border/70 bg-muted/45 px-4 py-3 text-sm text-foreground">
        {savedLabel}
      </div>
    );
  }
  return null;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireAppUser();
  const params = await searchParams;
  const [preference, llmConfig, smtpConfig] = await Promise.all([
    db.query.userPreference.findFirst({ where: eq(userPreference.userId, user.id) }),
    db.query.userLlmConfig.findFirst({ where: eq(userLlmConfig.userId, user.id) }),
    db.query.userSmtpConfig.findFirst({ where: eq(userSmtpConfig.userId, user.id) })
  ]);
  const values: PreferenceValues = {
    categories: preference?.categories ?? [],
    categoryWeights: preference?.categoryWeights ?? {},
    includeKeywords: preference?.includeKeywords ?? [],
    excludeKeywords: preference?.excludeKeywords ?? [],
    topN: preference?.topN ?? 5,
    sendTime: preference?.sendTime ?? "09:00",
    timezone: preference?.timezone ?? "Asia/Shanghai",
    summaryFocus: preference?.summaryFocus ?? ""
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">个人设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">每一项配置独立保存，长期生效。</p>
      </div>

      <SettingsNotice
        saved={params?.saved}
        error={params?.error}
        imported={params?.imported}
        skipped={params?.skipped}
        overwritePreference={params?.overwritePreference}
        overwriteStates={params?.overwriteStates}
        createStates={params?.createStates}
        preferenceFields={params?.preferenceFields}
        changedStates={params?.changedStates}
      />

      <SettingsSection title="arXiv 分类" description="选择需要长期跟踪的 arXiv 板块，并为重点板块设置本地排序权重。">
        <CardContent as="form" action="/api/settings/preferences" method="post" className="space-y-3">
          <PreferenceHiddenFields values={values} omit={["categories", "categoryWeights"]} />
          <CategoryPicker categories={ARXIV_CATEGORIES} selected={values.categories} categoryWeights={values.categoryWeights} />
          <div className="pt-2">
            <Button type="submit">保存分类</Button>
          </div>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="关键词规则" description="用关键词先筛掉明显不相关的论文，再进入排序和总结流程。">
        <CardContent as="form" action="/api/settings/preferences" method="post" className="grid gap-3">
          <PreferenceHiddenFields values={values} omit={["includeKeywords", "excludeKeywords"]} />
          <label className="grid gap-1.5 text-sm">
            包含关键词
            <input className="neu-input h-10 px-3 text-sm" name="includeKeywords" defaultValue={values.includeKeywords.join(", ")} />
          </label>
          <label className="grid gap-1.5 text-sm">
            排除关键词
            <input className="neu-input h-10 px-3 text-sm" name="excludeKeywords" defaultValue={values.excludeKeywords.join(", ")} />
          </label>
          <Button className="justify-self-start" type="submit">
            保存关键词
          </Button>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="日报生成" description="控制每天自动总结的论文数量、生成时间和显示时区。">
        <CardContent as="form" action="/api/settings/preferences" method="post" className="grid gap-3">
          <PreferenceHiddenFields values={values} omit={["topN", "sendTime", "timezone"]} />
          <label className="grid gap-1.5 text-sm">
            Top N
            <input className="neu-input h-10 px-3 text-sm" name="topN" type="number" min={1} max={50} defaultValue={values.topN} />
          </label>
          <label className="grid gap-1.5 text-sm">
            推送时间
            <input className="neu-input h-10 px-3 text-sm" name="sendTime" type="time" defaultValue={values.sendTime} />
          </label>
          <label className="grid gap-1.5 text-sm">
            时区
            <input className="neu-input h-10 px-3 text-sm" name="timezone" defaultValue={values.timezone} />
          </label>
          <Button className="justify-self-start" type="submit">
            保存日报生成
          </Button>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="总结关注点" description="给日报总结补充长期偏好，例如只关注方法、实验结果或应用场景。">
        <CardContent as="form" action="/api/settings/preferences" method="post" className="grid gap-3">
          <PreferenceHiddenFields values={values} omit={["summaryFocus"]} />
          <label className="grid gap-1.5 text-sm">
            关注点
            <textarea className="neu-input min-h-28 p-3 text-sm" name="summaryFocus" defaultValue={values.summaryFocus} />
          </label>
          <Button className="justify-self-start" type="submit">
            保存关注点
          </Button>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="LLM 配置" description="配置你自己的 /v1/chat/completions 兼容模型，用于单篇总结和日报摘要。">
        <CardContent as="form" action="/api/settings/llm" method="post" className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            Base URL
            <input className="neu-input h-10 px-3 text-sm" name="baseUrl" placeholder="https://api.openai.com" defaultValue={llmConfig?.baseUrl ?? ""} />
          </label>
          <label className="grid gap-1.5 text-sm">
            API Key
            <input className="neu-input h-10 px-3 text-sm" name="apiKey" placeholder="留空保持不变" type="password" />
          </label>
          <label className="grid gap-1.5 text-sm">
            Model
            <input className="neu-input h-10 px-3 text-sm" name="model" placeholder="gpt-4.1-mini" defaultValue={llmConfig?.model ?? ""} />
          </label>
          <Button className="justify-self-start" type="submit">
            保存模型配置
          </Button>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="日报发件 SMTP" description="配置日报通知使用的个人发件邮箱，只会发送到你的已验证注册邮箱。">
        <CardContent as="form" action="/api/settings/smtp" method="post" className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            SMTP Host
            <input className="neu-input h-10 px-3 text-sm" name="host" placeholder="smtp.example.com" defaultValue={smtpConfig?.host ?? ""} />
          </label>
          <label className="grid gap-1.5 text-sm">
            SMTP Port
            <input className="neu-input h-10 px-3 text-sm" name="port" placeholder="587" type="number" defaultValue={smtpConfig?.port ?? 587} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input name="secure" type="checkbox" defaultChecked={smtpConfig?.secure ?? false} />
            使用 SMTPS
          </label>
          <label className="grid gap-1.5 text-sm">
            From
            <input className="neu-input h-10 px-3 text-sm" name="from" placeholder="Daily arXiv <me@example.com>" defaultValue={smtpConfig?.from ?? ""} />
          </label>
          <label className="grid gap-1.5 text-sm">
            SMTP User
            <input className="neu-input h-10 px-3 text-sm" name="username" defaultValue={smtpConfig?.username ?? ""} />
          </label>
          <label className="grid gap-1.5 text-sm">
            SMTP Password
            <input className="neu-input h-10 px-3 text-sm" name="password" placeholder="留空保持不变" type="password" />
          </label>
          <Button className="justify-self-start" type="submit">
            保存 SMTP
          </Button>
        </CardContent>
      </SettingsSection>

      <SettingsSection title="个人数据迁移" description="下载或导入个人偏好、收藏论文和阅读状态；JSON 不包含 API Key 或 SMTP 密码。">
        <CardContent className="grid gap-4">
          <div>
            <Button asChild variant="secondary">
              <a href="/api/export/user">下载个人 JSON</a>
            </Button>
          </div>
          <form action="/api/settings/import" method="post" encType="multipart/form-data" className="grid gap-3 text-sm">
            <label className="grid gap-1.5">
              导入个人 JSON
              <input className="neu-input px-3 py-2 text-sm" name="portableExport" type="file" accept="application/json,.json" required />
            </label>
            <p className="text-xs text-muted-foreground">
              只导入偏好和当前实例已有论文的收藏、已读、忽略状态；不会导入日报正文、账号凭据、API Key 或 SMTP 密码。
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <label className="inline-flex items-center gap-2">
                <input name="includePreference" type="checkbox" defaultChecked />
                导入偏好
              </label>
              <label className="inline-flex items-center gap-2">
                <input name="includeReadingStates" type="checkbox" defaultChecked />
                导入阅读状态
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input name="confirmImport" type="checkbox" />
              确认将可导入字段写入当前账号
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="mode" value="preview" variant="secondary">
                预览导入
              </Button>
              <Button type="submit" name="mode" value="apply" variant="secondary">
                确认导入
              </Button>
            </div>
          </form>
        </CardContent>
      </SettingsSection>
    </div>
  );
}
