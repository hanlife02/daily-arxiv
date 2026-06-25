"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { PaperList } from "@/components/read/paper-list";
import { ChatPanel } from "@/components/read/chat-panel";
import { OriginalPaperPanel } from "@/components/read/original-paper-panel";
import {
  findExistingPaperId,
  firstPaperId,
  readLocalStorage,
  readSelectedPaperId,
  READ_LIST_COLLAPSED_KEY,
  writeSelectedPaperId,
  writeLocalStorage
} from "@/components/read/paper-reader-selection";
import { cn } from "@/lib/utils";

type PaperState = { favorited: boolean; read: boolean; ignored?: boolean };
type PaperStatePatch = Partial<PaperState>;

type Props = {
  papers: ScoredPaper[];
  paperStates: Record<string, PaperState>;
  llmConfigured: boolean;
  totalPaperCount: number;
  hasCategories: boolean;
  initialPaperId?: string | null;
};

const AUTO_READ_DELAY_MS = 10_000;
const DEFAULT_PAPER_STATE: PaperState = { favorited: false, read: false, ignored: false };

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function PaperReader({ papers, paperStates, llmConfigured, totalPaperCount, hasCategories, initialPaperId }: Props) {
  const router = useRouter();
  const paperIdSet = useMemo(() => new Set(papers.map((paper) => paper.arxivId)), [papers]);
  const initialSelectedId = findExistingPaperId(papers, initialPaperId);
  const listRef = useRef<HTMLDivElement>(null);
  const [states, setStates] = useState(paperStates);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [selectionReady, setSelectionReady] = useState(() => Boolean(initialSelectedId) || papers.length === 0);
  const [mobileShowPaper, setMobileShowPaper] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(() => readLocalStorage(READ_LIST_COLLAPSED_KEY) === "1");

  const visiblePapers = papers.filter((paper) => paper.arxivId === selectedId || !states[paper.arxivId]?.ignored);
  const selectedPaper = selectedId ? visiblePapers.find((p) => p.arxivId === selectedId) ?? null : null;
  const selectedPaperState = selectedPaper ? states[selectedPaper.arxivId] ?? DEFAULT_PAPER_STATE : DEFAULT_PAPER_STATE;

  const updatePaperState = useCallback(async (paperId: string, next: PaperStatePatch) => {
    setStates((current) => ({
      ...current,
      [paperId]: {
        ...(current[paperId] ?? DEFAULT_PAPER_STATE),
        ...next
      }
    }));

    await fetch("/api/papers/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperId, ...next })
    }).catch(() => undefined);
  }, []);

  function toggleListCollapsed() {
    setListCollapsed((current) => {
      const next = !current;
      writeLocalStorage(READ_LIST_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  const persistSelectedPaper = useCallback((id: string) => {
    writeSelectedPaperId(id);
    const params = new URLSearchParams(window.location.search);
    params.set("paper", id);
    router.replace(`/read?${params.toString()}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    const querySelectedId = findExistingPaperId(papers, initialPaperId);
    if (querySelectedId) {
      setSelectedId(querySelectedId);
      setSelectionReady(true);
      persistSelectedPaper(querySelectedId);
      return;
    }

    const storedSelectedId = findExistingPaperId(papers, readSelectedPaperId());
    const nextSelectedId = storedSelectedId ?? firstPaperId(papers);
    setSelectedId(nextSelectedId);
    setSelectionReady(true);
    if (nextSelectedId) persistSelectedPaper(nextSelectedId);
  }, [initialPaperId, papers, persistSelectedPaper]);

  useEffect(() => {
    if (!selectionReady) return;
    if (!selectedId || paperIdSet.has(selectedId)) return;
    const nextSelectedId = firstPaperId(papers);
    setSelectedId(nextSelectedId);
    if (nextSelectedId) persistSelectedPaper(nextSelectedId);
  }, [papers, paperIdSet, persistSelectedPaper, selectedId, selectionReady]);

  useEffect(() => {
    if (!selectedPaper || selectedPaperState.read) return;
    const paperIsVisible = mobileShowPaper || window.matchMedia("(min-width: 1024px)").matches;
    if (!paperIsVisible) return;

    const timeoutId = window.setTimeout(() => {
      void updatePaperState(selectedPaper.arxivId, { read: true });
    }, AUTO_READ_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [mobileShowPaper, selectedPaper, selectedPaperState.read, updatePaperState]);

  useEffect(() => {
    const listHiddenOnCurrentViewport = mobileShowPaper && !window.matchMedia("(min-width: 1024px)").matches;
    if (listCollapsed || listHiddenOnCurrentViewport || !selectedId) return;
    const list = listRef.current;
    if (!list) return;

    const scrollSelectedItemIntoView = () => {
      if (list.clientHeight === 0) return;
      const selectedItem = Array.from(list.querySelectorAll<HTMLElement>("[data-paper-id]")).find(
        (item) => item.dataset.paperId === selectedId
      );
      if (!selectedItem) return;

      const listRect = list.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      if (itemRect.height === 0) return;

      const targetTop = list.scrollTop + itemRect.top - listRect.top - (list.clientHeight - itemRect.height) / 2;
      list.scrollTop = Math.max(0, targetTop);
    };

    let frameId = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(scrollSelectedItemIntoView);
    });
    const timeoutId = window.setTimeout(scrollSelectedItemIntoView, 150);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [listCollapsed, mobileShowPaper, selectedId, visiblePapers.length]);

  function handleSelect(id: string) {
    persistSelectedPaper(id);
    setSelectedId(id);
    setMobileShowPaper(true);
  }

  useEffect(() => {
    function selectByOffset(offset: number) {
      if (visiblePapers.length === 0) return;
      const currentIndex = visiblePapers.findIndex((paper) => paper.arxivId === selectedPaper?.arxivId);
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visiblePapers.length - 1);
      const next = visiblePapers[nextIndex];
      if (!next || next.arxivId === selectedPaper?.arxivId) return;
      handleSelect(next.arxivId);
    }

    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        selectByOffset(1);
      }
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        selectByOffset(-1);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedPaper?.arxivId, visiblePapers]);

  return (
    <div
      className={cn(
        "grid min-h-[calc(100dvh-6rem)] gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden",
        listCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]"
          : "lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(18rem,22rem)] xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)_minmax(18rem,22rem)]"
      )}
    >
      <section
        aria-label="论文列表"
        className={cn("flex min-h-0 flex-col overflow-hidden", mobileShowPaper && "hidden lg:flex", listCollapsed && "lg:hidden")}
      >
        <div className="mb-3 hidden flex-shrink-0 items-center justify-between gap-3 lg:flex">
          <p className="text-sm text-muted-foreground">论文列表</p>
          <button
            type="button"
            onClick={toggleListCollapsed}
            className="neu-btn inline-flex h-9 items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground"
            aria-label="收起论文列表"
            title="收起论文列表"
          >
            <PanelLeftClose className="h-4 w-4" />
            收起列表
          </button>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          <PaperList
            papers={visiblePapers}
            selectedPaperId={selectedId}
            onSelect={handleSelect}
            paperStates={states}
            totalPaperCount={totalPaperCount}
            hasCategories={hasCategories}
          />
        </div>
      </section>

      <div
        className={`min-w-0 lg:h-full lg:min-h-0 lg:overflow-hidden ${
          mobileShowPaper ? "block" : "hidden lg:block"
        }`}
      >
        {selectedPaper ? (
          <OriginalPaperPanel
            paper={selectedPaper}
            onBack={() => setMobileShowPaper(false)}
            listControl={listCollapsed ? (
              <button
                type="button"
                onClick={toggleListCollapsed}
                className="neu-btn inline-flex h-9 items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground"
                aria-label="展开论文列表"
                title="展开论文列表"
              >
                <PanelLeftOpen className="h-4 w-4" />
                论文列表
              </button>
            ) : null}
          />
        ) : (
          <div className="neu-card flex h-full min-h-[28rem] items-center justify-center">
            <p className="text-muted-foreground">选择一篇论文阅读原文</p>
          </div>
        )}
      </div>

      <div
        className={`min-w-0 lg:h-full lg:min-h-0 lg:overflow-hidden ${
          mobileShowPaper ? "block" : "hidden lg:block"
        }`}
      >
        {selectedPaper ? (
          <ChatPanel
            paper={selectedPaper}
            paperState={selectedPaperState}
            onPaperStateChange={(next) => updatePaperState(selectedPaper.arxivId, next)}
            onBack={() => setMobileShowPaper(false)}
            llmConfigured={llmConfigured}
          />
        ) : (
          <div className="neu-card flex h-full min-h-[28rem] items-center justify-center">
            <p className="text-muted-foreground">选择一篇论文开始 AI 分析</p>
          </div>
        )}
      </div>
    </div>
  );
}
