"use client";

import { useEffect } from "react";
import type { ScoredPaper } from "@/lib/reports/scoring";

type UsePaperKeyboardNavigationParams = {
  readonly visiblePapers: readonly ScoredPaper[];
  readonly selectedPaperId: string | null;
  readonly onSelect: (arxivId: string) => void;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function usePaperKeyboardNavigation({
  visiblePapers,
  selectedPaperId,
  onSelect
}: UsePaperKeyboardNavigationParams) {
  useEffect(() => {
    function selectByOffset(offset: number) {
      if (visiblePapers.length === 0) return;
      const currentIndex = visiblePapers.findIndex((paper) => paper.arxivId === selectedPaperId);
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visiblePapers.length - 1);
      const next = visiblePapers[nextIndex];
      if (!next || next.arxivId === selectedPaperId) return;
      onSelect(next.arxivId);
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
  }, [onSelect, selectedPaperId, visiblePapers]);
}
