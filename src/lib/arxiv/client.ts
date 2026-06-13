import { XMLParser } from "fast-xml-parser";
import { ProxyAgent } from "undici";
import { parseArxivMainId } from "@/lib/arxiv/id";
import type { PaperRecord } from "@/lib/arxiv/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

type ArxivFeedEntry = {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  author?: { name: string } | Array<{ name: string }>;
  category?: { "@_term": string } | Array<{ "@_term": string }>;
  "arxiv:primary_category"?: { "@_term": string };
  link?: Array<{ "@_href": string; "@_title"?: string; "@_type"?: string }> | { "@_href": string; "@_title"?: string; "@_type"?: string };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getProxyAgent() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return undefined;
  return new ProxyAgent(proxyUrl);
}

export async function fetchArxivCategory(category: string, maxResults = 100) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `cat:${category}`);
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  url.searchParams.set("max_results", String(maxResults));

  const dispatcher = getProxyAgent();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "daily-arxiv/0.1 (self-hosted arxiv digest)"
    },
    ...(dispatcher ? { dispatcher } : {})
  });
  if (!response.ok) {
    throw new Error(`arXiv API failed: ${response.status}`);
  }

  return parseArxivFeed(await response.text());
}

export function parseArxivFeed(xml: string): PaperRecord[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: ArxivFeedEntry | ArxivFeedEntry[] } };
  return asArray(parsed.feed?.entry).map((entry) => {
    const links = asArray(entry.link);
    const categories = asArray(entry.category).map((category) => category["@_term"]).filter(Boolean);
    const pdfUrl = links.find((link) => link["@_title"] === "pdf" || link["@_type"] === "application/pdf")?.["@_href"];
    return {
      arxivId: parseArxivMainId(entry.id),
      title: normalizeText(entry.title),
      abstract: normalizeText(entry.summary),
      authors: asArray(entry.author).map((author) => author.name).filter(Boolean),
      categories,
      primaryCategory: entry["arxiv:primary_category"]?.["@_term"] ?? categories[0] ?? "",
      arxivUrl: links.find((link) => !link["@_title"])?.["@_href"] ?? entry.id,
      pdfUrl,
      publishedAt: new Date(entry.published),
      updatedAt: new Date(entry.updated)
    };
  });
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
