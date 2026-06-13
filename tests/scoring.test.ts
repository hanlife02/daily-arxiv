import { describe, expect, it } from "vitest";
import { rankPapers, selectTopPapers } from "@/lib/reports/scoring";
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
});
