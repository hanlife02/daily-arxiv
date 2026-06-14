"use client";

import { BookOpen, Star } from "lucide-react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { cn } from "@/lib/utils";

type Props = {
  papers: ScoredPaper[];
  selectedPaperId: string | null;
  onSelect: (arxivId: string) => void;
  paperStates: Record<string, { favorited: boolean; read: boolean }>;
};

export function PaperList({ papers, selectedPaperId, onSelect, paperStates }: Props) {
  if (papers.length === 0) {
    return (
      <div className="neu-card flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">暂无匹配论文，请检查订阅设置。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-1 pb-1 text-sm text-muted-foreground">
        共 {papers.length} 篇论文
      </div>
      {papers.map((paper) => {
        const state = paperStates[paper.arxivId];
        const isSelected = paper.arxivId === selectedPaperId;

        return (
          <button
            key={paper.arxivId}
            onClick={() => onSelect(paper.arxivId)}
            className={cn(
              "w-full rounded-xl px-4 py-3 text-left transition-all",
              isSelected ? "neu-raised-sm" : "neu-card hover:shadow-md"
            )}
          >
            <div className="line-clamp-2 text-sm font-medium leading-snug">
              {paper.title}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="neu-inset rounded-md px-1.5 py-0.5">
                {paper.primaryCategory}
              </span>
              <span className="neu-inset rounded-md px-1.5 py-0.5">
                {paper.score.toFixed(1)} 分
              </span>
              {state?.read && (
                <span className="inline-flex items-center gap-0.5 text-accent">
                  <BookOpen className="h-3 w-3" />
                  已读
                </span>
              )}
              {state?.favorited && (
                <span className="inline-flex items-center gap-0.5 text-yellow-500">
                  <Star className="h-3 w-3 fill-current" />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
