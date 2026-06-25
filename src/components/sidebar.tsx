"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, BookMarked, BookOpen, FileText, Newspaper, PanelLeftClose, PanelLeftOpen, Settings, Shield } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "仪表盘", icon: BarChart3 },
  { href: "/papers", label: "论文池", icon: Newspaper },
  { href: "/read", label: "论文阅读", icon: BookOpen },
  { href: "/reports", label: "日报历史", icon: FileText },
  { href: "/settings", label: "个人设置", icon: Settings }
];

const SIDEBAR_COLLAPSED_KEY = "daily-arxiv.sidebar.collapsed";

export function Sidebar({ className, role }: { className?: string; role: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const navItems = role === "admin" ? [...items, { href: "/admin", label: "管理员", icon: Shield }] : items;

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex w-full flex-col transition-[width] duration-200 ease-in-out md:h-dvh md:min-h-0 md:shrink-0 md:overflow-y-auto",
        collapsed ? "md:w-20" : "md:w-52",
        className
      )}
    >
      <div className={cn("flex h-14 items-center justify-between gap-2 px-4", collapsed && "md:px-2")}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold text-foreground" title="daily-arxiv">
          <BookMarked className="h-5 w-5 text-accent" />
          <span className={cn("truncate", collapsed && "md:sr-only")}>daily-arxiv</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className={cn(collapsed && "md:hidden")}>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="neu-btn hidden h-9 w-9 items-center justify-center text-muted-foreground md:inline-flex"
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <nav className={cn("grid gap-1.5 p-3", collapsed && "md:px-3")}>
        <div
          className={cn(
            "neu-inset mb-1 rounded-xl px-4 py-2 text-xs text-muted-foreground",
            collapsed && "md:flex md:h-10 md:items-center md:justify-center md:px-0"
          )}
          title={`当前角色：${role === "admin" ? "管理员" : "普通用户"}`}
        >
          <span className={collapsed ? "md:sr-only" : ""}>当前角色：{role === "admin" ? "管理员" : "普通用户"}</span>
          <span className={cn("hidden text-[11px] font-semibold", collapsed && "md:inline")}>{role === "admin" ? "管" : "用"}</span>
        </div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className={cn(
              "neu-raised-sm flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:text-foreground",
              collapsed && "md:justify-center md:px-0",
              pathname === item.href && "text-accent"
            )}
          >
            <item.icon className="h-4 w-4" />
            <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={cn("mt-auto p-3 pt-0", collapsed && "md:px-3")}>
        <LogoutButton compact={collapsed} />
      </div>
    </aside>
  );
}
