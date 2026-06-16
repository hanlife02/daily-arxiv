"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CrawlButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCrawl() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/papers/crawl", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage(data.message);
        router.refresh();
      } else {
        setMessage(data.error ?? "抓取失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleCrawl} disabled={loading} variant="secondary">
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "抓取中..." : "手动抓取"}
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}
