import type { ScoredPaper } from "@/lib/reports/scoring";

export const READ_LIST_COLLAPSED_KEY = "daily-arxiv.read.listCollapsed";

const READ_SELECTED_PAPER_KEY = "daily-arxiv.read.selectedPaperId";

export function findExistingPaperId(papers: readonly ScoredPaper[], id?: string | null) {
  if (!id) return null;
  return papers.some((paper) => paper.arxivId === id) ? id : null;
}

export function firstPaperId(papers: readonly ScoredPaper[]) {
  return papers[0]?.arxivId ?? null;
}

function browserLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

export function writeLocalStorage(key: string, value: string) {
  const storage = browserLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

export function readLocalStorage(key: string) {
  const storage = browserLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

export function readSelectedPaperId() {
  return readLocalStorage(READ_SELECTED_PAPER_KEY);
}

export function writeSelectedPaperId(id: string) {
  writeLocalStorage(READ_SELECTED_PAPER_KEY, id);
}
