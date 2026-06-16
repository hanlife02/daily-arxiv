"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Paper = {
  arxivId: string;
  title: string;
  arxivUrl: string;
  categories: string[];
};

type PaperState = {
  favorited: boolean;
};

type Props = {
  papers: Paper[];
  states: Map<string, PaperState>;
};

export function PaperTable({ papers, states }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function toggleFavorite(paperId: string, currentlyFavorited: boolean) {
    setPending(paperId);
    try {
      await fetch("/api/papers/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          paperId,
          favorited: currentlyFavorited ? "false" : "true"
        })
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-3 pr-4 font-medium">arXiv ID</th>
            <th className="pb-3 pr-4 font-medium">标题</th>
            <th className="pb-3 pr-4 font-medium">板块</th>
            <th className="pb-3 pr-4 font-medium">状态</th>
            <th className="pb-3 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((item) => {
            const state = states.get(item.arxivId);
            const isFav = state?.favorited ?? false;
            return (
              <tr key={item.arxivId} className="border-t border-border/40">
                <td className="py-3 pr-4 font-mono">{item.arxivId}</td>
                <td className="py-3 pr-4">
                  <a className="hover:underline" href={item.arxivUrl} target="_blank" rel="noreferrer">{item.title}</a>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{item.categories.join(", ")}</td>
                <td className="py-3 pr-4">{isFav ? "已收藏" : "未收藏"}</td>
                <td className="py-3 text-right">
                  <Button
                    variant="secondary"
                    disabled={pending === item.arxivId}
                    onClick={() => toggleFavorite(item.arxivId, isFav)}
                  >
                    {pending === item.arxivId ? "..." : isFav ? "取消收藏" : "收藏"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
