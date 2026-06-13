import type { PaperRecord } from "@/lib/arxiv/types";

export function isNewSubmission(paper: Pick<PaperRecord, "publishedAt" | "updatedAt">, toleranceMinutes = 5) {
  const delta = Math.abs(paper.updatedAt.getTime() - paper.publishedAt.getTime());
  return delta <= toleranceMinutes * 60 * 1000;
}

export function filterNewSubmissions(papers: PaperRecord[]) {
  return papers.filter((paper) => isNewSubmission(paper));
}
