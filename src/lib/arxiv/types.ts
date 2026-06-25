export type PaperRecord = {
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  primaryCategory: string;
  arxivUrl: string;
  pdfUrl?: string;
  publishedAt: Date;
  updatedAt: Date;
};
