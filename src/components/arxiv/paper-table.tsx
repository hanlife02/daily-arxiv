"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type Paper = {
  arxivId: string;
  title: string;
  arxivUrl: string;
  categories: string[];
};

type PaperState = {
  favorited: boolean;
  read?: boolean;
  ignored?: boolean;
  recommendedAt?: Date | null;
};

type Props = {
  papers: Paper[];
  states: Map<string, PaperState>;
};

type PaperStatePatch = { favorited?: boolean; read?: boolean; ignored?: boolean };

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function PaperTable({ papers, states }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = new Set(selectedIds);
  const allSelected = papers.length > 0 && selectedIds.length === papers.length;

  async function updateState(paperIds: string[], patch: PaperStatePatch, pendingKey: string, confirmLabel?: string) {
    if (paperIds.length === 0) return;
    if (confirmLabel && !window.confirm(`确认将选中的 ${paperIds.length} 篇论文${confirmLabel}？`)) return;
    setPending(pendingKey);
    try {
      await fetch("/api/papers/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds, ...patch })
      });
      setSelectedIds([]);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  function toggleSelected(paperId: string, selected: boolean) {
    setSelectedIds((current) => selected
      ? [...new Set([...current, paperId])]
      : current.filter((id) => id !== paperId));
  }

  function toggleAll(selected: boolean) {
    setSelectedIds(selected ? papers.map((paper) => paper.arxivId) : []);
  }

  function paperLabels(state: PaperState | undefined) {
    return [
      state?.favorited ? "已收藏" : null,
      state?.read ? "已读" : "未读",
      state?.ignored ? "已忽略" : null,
      state?.recommendedAt ? "已推荐" : null
    ].filter(Boolean);
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || pending || isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        setSelectedIds([]);
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "a" && papers.length > 0) {
        event.preventDefault();
        toggleAll(!allSelected);
        return;
      }
      if (selectedIds.length === 0) return;
      if (key === "r") {
        event.preventDefault();
        void updateState([...selectedIds], { read: true }, "bulk-read", "标为已读");
      }
      if (key === "i") {
        event.preventDefault();
        void updateState([...selectedIds], { ignored: true }, "bulk-ignore", "忽略");
      }
      if (key === "u") {
        event.preventDefault();
        void updateState([...selectedIds], { ignored: false }, "bulk-unignore", "取消忽略");
      }
      if (key === "f") {
        event.preventDefault();
        void updateState([...selectedIds], { favorited: true }, "bulk-favorite", "收藏");
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [allSelected, papers.length, pending, selectedIds]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">已选择 {selectedIds.length} 篇</span>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.length === 0 || pending === "bulk-read"}
          onClick={() => updateState([...selectedIds], { read: true }, "bulk-read", "标为已读")}
        >
          标为已读
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.length === 0 || pending === "bulk-ignore"}
          onClick={() => updateState([...selectedIds], { ignored: true }, "bulk-ignore", "忽略")}
        >
          忽略
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.length === 0 || pending === "bulk-unignore"}
          onClick={() => updateState([...selectedIds], { ignored: false }, "bulk-unignore", "取消忽略")}
        >
          取消忽略
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.length === 0 || pending === "bulk-favorite"}
          onClick={() => updateState([...selectedIds], { favorited: true }, "bulk-favorite", "收藏")}
        >
          收藏
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedIds.length === 0 || pending === "bulk-unfavorite"}
          onClick={() => updateState([...selectedIds], { favorited: false }, "bulk-unfavorite", "取消收藏")}
        >
          取消收藏
        </Button>
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[780px] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-3 pr-4 font-medium">
              <input
                aria-label="选择当前页全部论文"
                type="checkbox"
                checked={allSelected}
                onChange={(event) => toggleAll(event.currentTarget.checked)}
              />
            </th>
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
            const labels = paperLabels(state);
            return (
              <tr key={item.arxivId} className="border-t border-border/40">
                <td className="py-3 pr-4">
                  <input
                    aria-label={`选择 ${item.arxivId}`}
                    type="checkbox"
                    checked={selectedSet.has(item.arxivId)}
                    onChange={(event) => toggleSelected(item.arxivId, event.currentTarget.checked)}
                  />
                </td>
                <td className="py-3 pr-4 font-mono">{item.arxivId}</td>
                <td className="py-3 pr-4">
                  <a className="hover:underline" href={item.arxivUrl} target="_blank" rel="noreferrer">{item.title}</a>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{item.categories.join(", ")}</td>
                <td className="py-3 pr-4">{labels.join(" / ")}</td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="secondary">
                      <Link href={`/read?paper=${encodeURIComponent(item.arxivId)}`}>
                        <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                        阅读
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending === item.arxivId}
                      onClick={() => updateState([item.arxivId], { favorited: !isFav }, item.arxivId)}
                    >
                      {pending === item.arxivId ? "..." : isFav ? "取消收藏" : "收藏"}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {papers.map((item) => {
          const state = states.get(item.arxivId);
          const isFav = state?.favorited ?? false;
          const labels = paperLabels(state);
          return (
            <article key={item.arxivId} className="neu-inset rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <input
                  aria-label={`选择 ${item.arxivId}`}
                  className="mt-1"
                  type="checkbox"
                  checked={selectedSet.has(item.arxivId)}
                  onChange={(event) => toggleSelected(item.arxivId, event.currentTarget.checked)}
                />
                <div className="min-w-0 flex-1">
                  <a className="font-medium leading-snug hover:underline" href={item.arxivUrl} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{item.arxivId}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.categories.join(", ")}</p>
                  <p className="mt-2 text-xs">{labels.join(" / ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="secondary">
                      <Link href={`/read?paper=${encodeURIComponent(item.arxivId)}`}>
                        <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                        阅读
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending === item.arxivId}
                      onClick={() => updateState([item.arxivId], { favorited: !isFav }, item.arxivId)}
                    >
                      {pending === item.arxivId ? "..." : isFav ? "取消收藏" : "收藏"}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
