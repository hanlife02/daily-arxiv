import { ARXIV_CATEGORIES } from "@/lib/arxiv/categories";

export function GET() {
  return Response.json({ categories: ARXIV_CATEGORIES });
}
