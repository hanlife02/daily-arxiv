"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
};

const tabs: Tab[] = [
  { id: "arxiv-subscription", label: "arXiv 订阅" },
  { id: "daily-preferences", label: "日报偏好" },
  { id: "llm-config", label: "LLM 配置" },
  { id: "smtp-config", label: "SMTP 配置" },
];

export function SettingsTabs({ children }: { children: React.ReactNode[] }) {
  const [active, setActive] = useState(tabs[0].id);

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 rounded-xl p-1 neu-card">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              active === tab.id
                ? "neu-raised-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {tabs.map((tab, i) => (
        <div key={tab.id} className={cn(active !== tab.id && "hidden")}>
          {children[i]}
        </div>
      ))}
    </div>
  );
}
