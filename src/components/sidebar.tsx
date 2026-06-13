import Link from "next/link";
import { BarChart3, BookMarked, FileText, Newspaper, Settings, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "仪表盘", icon: BarChart3 },
  { href: "/papers", label: "论文池", icon: Newspaper },
  { href: "/reports", label: "日报历史", icon: FileText },
  { href: "/settings", label: "个人设置", icon: Settings },
  { href: "/admin", label: "管理员", icon: Shield }
];

export function Sidebar({ className }: { className?: string }) {
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
        {items.map((item) => (
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
    </aside>
  );
}
