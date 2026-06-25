import type { PaperRecord } from "@/lib/arxiv/types";

export function paper(overrides: Partial<PaperRecord> = {}): PaperRecord {
  return {
    arxivId: "2501.12345",
    title: "Efficient Language Model Retrieval",
    abstract: "We study retrieval augmented generation for scientific papers.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CL"],
    primaryCategory: "cs.CL",
    arxivUrl: "https://arxiv.org/abs/2501.12345",
    publishedAt: new Date("2026-06-13T10:00:00.000Z"),
    updatedAt: new Date("2026-06-13T10:00:00.000Z"),
    ...overrides
  };
}
