"use client";

import { ArrowLeft, BookOpen, ExternalLink, EyeOff, FileText, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { explainScore } from "@/lib/reports/scoring";
import { cn } from "@/lib/utils";

type OriginalPaperPanelProps = {
  paper: ScoredPaper;
  onBack: () => void;
  listControl?: ReactNode;
  paperState?: OriginalPaperState;
  onPaperStateChange?: (state: Partial<OriginalPaperState>) => void | Promise<void>;
};

type OriginalPaperState = { favorited: boolean; read: boolean; ignored?: boolean };

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const PDF_IFRAME_LOAD_DELAY_MS = 120;
const PDF_IFRAME_ROOT_MARGIN = "160px";

function isVisibleIntersection(entry: IntersectionObserverEntry) {
  return entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0;
}

function useVisiblePdfUrl(pdfUrl: string | undefined) {
  const pdfContainerRef = useRef<HTMLElement>(null);
  const [visiblePdfUrl, setVisiblePdfUrl] = useState<string | undefined>();

  useEffect(() => {
    setVisiblePdfUrl(undefined);
    if (!pdfUrl) return;

    const container = pdfContainerRef.current;
    if (!container) return;

    let timeoutId: number | undefined;
    const schedulePdfLoad = () => {
      if (timeoutId !== undefined) return;
      timeoutId = window.setTimeout(() => setVisiblePdfUrl(pdfUrl), PDF_IFRAME_LOAD_DELAY_MS);
    };

    if (!("IntersectionObserver" in window)) {
      schedulePdfLoad();
      return () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      };
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(isVisibleIntersection)) return;
      observer.disconnect();
      schedulePdfLoad();
    }, { rootMargin: PDF_IFRAME_ROOT_MARGIN });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [pdfUrl]);

  return {
    pdfContainerRef,
    visiblePdfUrl: visiblePdfUrl === pdfUrl ? visiblePdfUrl : undefined
  };
}

export function OriginalPaperPanel({
  paper,
  onBack,
  listControl,
  paperState,
  onPaperStateChange
}: OriginalPaperPanelProps) {
  const scoreReasons = explainScore(paper);
  const { pdfContainerRef, visiblePdfUrl } = useVisiblePdfUrl(paper.pdfUrl);

  function updatePaperState(next: Partial<OriginalPaperState>) {
    void onPaperStateChange?.(next);
  }

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
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                {paperState ? (
                  <>
                    <button
                      type="button"
                      onClick={() => updatePaperState({ read: !paperState.read })}
                      className={cn(
                        "neu-btn inline-flex h-9 items-center gap-1.5 px-3 text-xs",
                        paperState.read ? "text-accent" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      已读
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePaperState({ favorited: !paperState.favorited })}
                      className={cn(
                        "neu-btn inline-flex h-9 items-center gap-1.5 px-3 text-xs",
                        paperState.favorited ? "text-yellow-500" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Star className={cn("h-3.5 w-3.5", paperState.favorited && "fill-current")} />
                      收藏
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePaperState({ ignored: !paperState.ignored })}
                      className={cn(
                        "neu-btn inline-flex h-9 items-center gap-1.5 px-3 text-xs",
                        paperState.ignored ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      忽略
                    </button>
                  </>
                ) : null}
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
        <section ref={pdfContainerRef} className="neu-inset min-h-[28rem] overflow-hidden rounded-2xl">
          {paper.pdfUrl ? (
            <div className="h-[68vh] min-h-[28rem] w-full rounded-2xl bg-card 2xl:h-full">
              {visiblePdfUrl ? (
                <iframe
                  title={`${paper.title} PDF`}
                  src={visiblePdfUrl}
                  loading="lazy"
                  className="h-full w-full rounded-2xl bg-card"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">PDF 正在加载...</p>
                </div>
              )}
            </div>
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
