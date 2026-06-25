"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type LogoutButtonProps = {
  compact?: boolean;
};

export function LogoutButton({ compact = false }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      credentials: "same-origin"
    }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      title="退出登录"
      aria-label="退出登录"
      className={cn(
        "neu-raised-sm flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        compact && "justify-center px-0"
      )}
    >
      <LogOut className="h-4 w-4" />
      <span className={compact ? "sr-only" : ""}>{loading ? "退出中" : "退出登录"}</span>
    </button>
  );
}
