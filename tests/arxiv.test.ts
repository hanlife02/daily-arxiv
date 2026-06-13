import { describe, expect, it } from "vitest";
import { filterNewSubmissions, isNewSubmission } from "@/lib/arxiv/filter";
import { parseArxivMainId, sameMainArxivId } from "@/lib/arxiv/id";
import { getSubscriptionUnion, validateArxivCategories } from "@/lib/arxiv/categories";
import { paper } from "./helpers";

describe("arXiv core rules", () => {
  it("parses main arXiv id and ignores version", () => {
    expect(parseArxivMainId("https://arxiv.org/abs/2501.12345v2")).toBe("2501.12345");
    expect(sameMainArxivId("2501.12345v1", "2501.12345v3")).toBe(true);
  });

  it("validates categories and supports subscription union", () => {
    expect(validateArxivCategories(["cs.CL", "stat.ML"]).ok).toBe(true);
    expect(validateArxivCategories(["bad value"]).ok).toBe(false);
    expect(getSubscriptionUnion([["cs.CL", "stat.ML"], ["cs.AI", "cs.CL"]])).toEqual(["cs.AI", "cs.CL", "stat.ML"]);
  });

  it("keeps only new submissions", () => {
    const fresh = paper();
    const revised = paper({ arxivId: "2501.12346", updatedAt: new Date("2026-06-14T10:00:00.000Z") });
    expect(isNewSubmission(fresh)).toBe(true);
    expect(isNewSubmission(revised)).toBe(false);
    expect(filterNewSubmissions([fresh, revised]).map((item) => item.arxivId)).toEqual(["2501.12345"]);
  });
});
