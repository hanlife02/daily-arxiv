import Link from "next/link";
import { BarChart3, BookMarked, BookOpen, FileText, Newspaper, Settings, Shield } from "lucide-react";
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

export function Sidebar({ className, role }: { className?: string; role: string }) {
  const navItems = role === "admin" ? [...items, { href: "/admin", label: "管理员", icon: Shield }] : items;

  return (
    <aside className={cn("flex w-full flex-col md:w-64 md:min-h-screen", className)}>
      <div className="flex h-14 items-center justify-between px-5">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
          <BookMarked className="h-5 w-5 text-accent" />
          <span>daily-arxiv</span>
        </Link>
        <ThemeToggle />
      </div>
      <nav className="grid gap-1.5 p-3">
        <div className="neu-inset mb-1 rounded-xl px-4 py-2 text-xs text-muted-foreground">
          当前角色：{role === "admin" ? "管理员" : "普通用户"}
        </div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="neu-raised-sm flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:text-foreground"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto p-3 pt-0">
        <LogoutButton />
      </div>
    </aside>
  );
}
