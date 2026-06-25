"use client";

import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import type { ReactNode } from "react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { explainScore } from "@/lib/reports/scoring";
import { cn } from "@/lib/utils";

type OriginalPaperPanelProps = {
  paper: ScoredPaper;
  onBack: () => void;
  listControl?: ReactNode;
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function OriginalPaperPanel({ paper, onBack, listControl }: OriginalPaperPanelProps) {
  const scoreReasons = explainScore(paper);

  return (
    <article className="neu-card flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-border/40 px-4 py-4">
        <div className="flex items-start gap-3">
          {listControl ? (
            <div className="hidden flex-shrink-0 lg:block">
              {listControl}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="neu-btn mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center text-muted-foreground lg:hidden"
            aria-label="返回论文队列"
            title="返回论文队列"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="neu-inset rounded-md px-2 py-1">{paper.primaryCategory}</span>
                <span>{dateFormatter.format(paper.publishedAt)}</span>
                <span>{paper.score.toFixed(1)} 分</span>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <a
                  href={paper.arxivUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neu-btn inline-flex h-9 items-center gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  arXiv <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {paper.pdfUrl ? (
                  <a
                    href={paper.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neu-btn-primary inline-flex h-9 items-center gap-1.5 px-3 text-xs"
                  >
                    PDF <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
            <h1 className="text-balance text-lg font-semibold leading-snug text-foreground">{paper.title}</h1>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{paper.authors.join(", ")}</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 2xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <section className="neu-inset min-h-[28rem] overflow-hidden rounded-2xl">
          {paper.pdfUrl ? (
            <iframe
              title={`${paper.title} PDF`}
              src={paper.pdfUrl}
              className="h-[68vh] min-h-[28rem] w-full rounded-2xl bg-card 2xl:h-full"
            />
          ) : (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">这篇论文没有可嵌入的 PDF 链接，请从 arXiv 打开原文。</p>
              <a
                href={paper.arxivUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                打开 arXiv <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section>
            <h2 className="text-sm font-semibold">原文摘要</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{paper.abstract}</p>
          </section>
          <section>
            <h2 className="text-sm font-semibold">入选线索</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {scoreReasons.map((reason) => (
                <span key={reason} className="neu-inset rounded-md px-2 py-1 text-xs text-muted-foreground">
                  {reason}
                </span>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold">分类</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {paper.categories.map((category) => (
                <span
                  key={category}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    category === paper.primaryCategory ? "bg-accent text-accent-foreground" : "neu-inset text-muted-foreground"
                  )}
                >
                  {category}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}
