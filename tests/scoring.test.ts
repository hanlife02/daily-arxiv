import { describe, expect, it } from "vitest";
import { advancedRankPapers, rankPapers, selectTopPapers } from "@/lib/reports/scoring";
import { paper } from "./helpers";

describe("local ranking", () => {
  it("scores include keywords and filters exclude keywords", () => {
    const papers = [
      paper({ arxivId: "2501.00001", title: "Language Agents for Science" }),
      paper({ arxivId: "2501.00002", title: "Vision Model", abstract: "withdrawn benchmark", categories: ["cs.CV"] })
    ];
    const ranked = rankPapers(papers, {
      categories: ["cs.CL", "cs.CV"],
      includeKeywords: ["agent"],
      excludeKeywords: ["withdrawn"],
      topN: 5
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.arxivId).toBe("2501.00001");
    expect(ranked[0]?.reasons).toContain("title:agent");
  });

  it("selects Top N after sorting", () => {
    const papers = [
      paper({ arxivId: "2501.00001", title: "Plain Paper" }),
      paper({ arxivId: "2501.00002", title: "Retrieval Agent Paper" }),
      paper({ arxivId: "2501.00003", title: "Another Agent Paper" })
    ];
    const selected = selectTopPapers(papers, {
      categories: ["cs.CL"],
      includeKeywords: ["agent"],
      excludeKeywords: [],
      topN: 2
    });

    expect(selected).toHaveLength(2);
    expect(selected.every((item) => item.title.toLowerCase().includes("agent"))).toBe(true);
  });

  it("ranks newer papers higher when relevance is otherwise equal", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const ranked = rankPapers(
      [
        paper({
          arxivId: "2501.00001",
          title: "Plain Language Model Paper",
          publishedAt: new Date("2026-06-11T12:00:00.000Z"),
          updatedAt: new Date("2026-06-11T12:00:00.000Z")
        }),
        paper({
          arxivId: "2501.00002",
          title: "Plain Language Model Paper",
          publishedAt: new Date("2026-06-18T08:00:00.000Z"),
          updatedAt: new Date("2026-06-18T08:00:00.000Z")
        })
      ],
      {
        categories: ["cs.CL"],
        includeKeywords: [],
        excludeKeywords: [],
        topN: 2
      },
      now
    );

    expect(ranked[0]?.arxivId).toBe("2501.00002");
    expect(ranked[0]?.scoreBreakdown.novelty).toBeGreaterThan(ranked[1]?.scoreBreakdown.novelty ?? 0);
  });

  it("rewards concrete value signals in title and abstract", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const ranked = rankPapers(
      [
        paper({
          arxivId: "2501.00001",
          title: "A New Language Model Method",
          abstract: "We propose a new approach for language modeling."
        }),
        paper({
          arxivId: "2501.00002",
          title: "Open-Source Benchmark for Language Models",
          abstract: "We release a large-scale dataset with reproducible evaluation code."
        })
      ],
      {
        categories: ["cs.CL"],
        includeKeywords: [],
        excludeKeywords: [],
        topN: 2
      },
      now
    );

    expect(ranked[0]?.arxivId).toBe("2501.00002");
    expect(ranked[0]?.reasons).toContain("value:title:benchmark");
    expect(ranked[0]?.scoreBreakdown.value).toBeGreaterThan(ranked[1]?.scoreBreakdown.value ?? 0);
  });

  it("uses S2 author authority in advanced ranking", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const papers = [
      paper({ arxivId: "2501.00001", title: "Agent Benchmark" }),
      paper({ arxivId: "2501.00002", title: "Agent Benchmark" })
    ];
    const s2Data = new Map([
      [
        "2501.00001",
        { arxivId: "2501.00001", avgHIndex: 4, strongAuthorCount: 0, peakHIndex: 8, referencesCount: 24 }
      ],
      [
        "2501.00002",
        { arxivId: "2501.00002", avgHIndex: 55, strongAuthorCount: 3, peakHIndex: 90, referencesCount: 42 }
      ]
    ]);

    const ranked = advancedRankPapers(
      papers,
      {
        categories: ["cs.CL"],
        includeKeywords: ["agent"],
        excludeKeywords: [],
        topN: 2
      },
      s2Data,
      now
    );

    expect(ranked[0]?.arxivId).toBe("2501.00002");
    expect(ranked[0]?.authorScore).toBeGreaterThan(ranked[1]?.authorScore ?? 0);
  });
});
