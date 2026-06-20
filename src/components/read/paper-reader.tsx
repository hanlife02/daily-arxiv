"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { PaperList } from "@/components/read/paper-list";
import { ChatPanel } from "@/components/read/chat-panel";

type Props = {
  papers: ScoredPaper[];
  paperStates: Record<string, { favorited: boolean; read: boolean; ignored?: boolean }>;
  llmConfigured: boolean;
  totalPaperCount: number;
  hasCategories: boolean;
  initialPaperId?: string | null;
};

const READ_SELECTED_PAPER_KEY = "daily-arxiv.read.selectedPaperId";
const READ_LIST_SCROLL_KEY = "daily-arxiv.read.listScrollTop";

function replacePaperQuery(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("paper") === id) return;
  url.searchParams.set("paper", id);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled in hardened browser profiles.
  }
}

function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persistSelectedPaper(id: string) {
  writeLocalStorage(READ_SELECTED_PAPER_KEY, id);
  replacePaperQuery(id);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function PaperReader({ papers, paperStates, llmConfigured, totalPaperCount, hasCategories, initialPaperId }: Props) {
  const paperIdSet = useMemo(() => new Set(papers.map((paper) => paper.arxivId)), [papers]);
  const listScrollRestoredRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [states, setStates] = useState(paperStates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPaperId && papers.some((paper) => paper.arxivId === initialPaperId)
      ? initialPaperId
      : papers.length > 0 ? papers[0].arxivId : null
  );
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const visiblePapers = papers.filter((paper) => paper.arxivId === selectedId || !states[paper.arxivId]?.ignored);
  const selectedPaper = visiblePapers.find((p) => p.arxivId === selectedId) ?? visiblePapers[0] ?? null;

  useEffect(() => {
    if (initialPaperId || papers.length === 0) return;
    const storedPaperId = readLocalStorage(READ_SELECTED_PAPER_KEY);
    if (storedPaperId && paperIdSet.has(storedPaperId) && storedPaperId !== selectedId) {
      setSelectedId(storedPaperId);
    }
  }, [initialPaperId, papers.length, paperIdSet, selectedId]);

  useEffect(() => {
    if (selectedId && paperIdSet.has(selectedId)) return;
    setSelectedId(papers[0]?.arxivId ?? null);
  }, [papers, paperIdSet, selectedId]);

  useEffect(() => {
    if (!selectedId || !paperIdSet.has(selectedId)) return;
    persistSelectedPaper(selectedId);
  }, [paperIdSet, selectedId]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || listScrollRestoredRef.current) return;
    listScrollRestoredRef.current = true;
    const storedTop = Number(readLocalStorage(READ_LIST_SCROLL_KEY));
    if (!Number.isFinite(storedTop) || storedTop <= 0) return;
    requestAnimationFrame(() => {
      list.scrollTop = storedTop;
    });
  }, [visiblePapers.length]);

  function handleSelect(id: string) {
    persistSelectedPaper(id);
    setSelectedId(id);
    setMobileShowChat(true);
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
    <div className="flex h-[calc(100vh-3.5rem)] gap-4">
      <div
        ref={listRef}
        onScroll={(event) => writeLocalStorage(READ_LIST_SCROLL_KEY, String(Math.round(event.currentTarget.scrollTop)))}
        className={`w-full flex-shrink-0 overflow-y-auto lg:w-1/3 ${
          mobileShowChat ? "hidden lg:block" : ""
        }`}
      >
        <PaperList
          papers={visiblePapers}
          selectedPaperId={selectedId}
          onSelect={handleSelect}
          paperStates={states}
          totalPaperCount={totalPaperCount}
          hasCategories={hasCategories}
        />
      </div>

      <div
        className={`min-w-0 flex-col lg:flex lg:w-2/3 ${
          mobileShowChat ? "flex" : "hidden lg:flex"
        }`}
      >
        {selectedPaper ? (
          <ChatPanel
            paper={selectedPaper}
            paperState={states[selectedPaper.arxivId] ?? { favorited: false, read: false, ignored: false }}
            onPaperStateChange={(next) => setStates((current) => ({
              ...current,
              [selectedPaper.arxivId]: {
                ...(current[selectedPaper.arxivId] ?? { favorited: false, read: false, ignored: false }),
                ...next
              }
            }))}
            onBack={() => setMobileShowChat(false)}
            llmConfigured={llmConfigured}
          />
        ) : (
          <div className="neu-card flex h-full items-center justify-center">
            <p className="text-muted-foreground">选择一篇论文开始阅读</p>
          </div>
        )}
      </div>
    </div>
  );
}
