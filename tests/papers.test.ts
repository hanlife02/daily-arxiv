import { describe, expect, it } from "vitest";
import { paperHasAnyCategory } from "@/lib/app/paper-categories";
import { applyPaperStatePatch, hasPaperStatePatch, normalizePaperIds, normalizePaperStatePatch } from "@/lib/app/paper-state";

describe("paper category matching", () => {
  it("matches papers by any arXiv category, including secondary categories", () => {
    expect(paperHasAnyCategory(["cs.AI", "cs.CL"], ["cs.CL"])).toBe(true);
    expect(paperHasAnyCategory(["math.OC", "stat.ML"], ["cs.CL", "stat.ML"])).toBe(true);
    expect(paperHasAnyCategory(["physics.optics"], ["cs.CL"])).toBe(false);
    expect(paperHasAnyCategory(["cs.CL"], [])).toBe(false);
  });
});

describe("paper state updates", () => {
  it("normalizes unique paper ids for bulk updates", () => {
    expect(normalizePaperIds([" 2501.00001 ", "2501.00002", "2501.00001", ""])).toEqual([
      "2501.00001",
      "2501.00002"
    ]);
    expect(normalizePaperIds("2501.00003")).toEqual(["2501.00003"]);
    expect(normalizePaperIds(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("keeps only explicit boolean state fields", () => {
    const patch = normalizePaperStatePatch({
      favorited: true,
      read: undefined,
      ignored: false
    });

    expect(patch).toEqual({ favorited: true, ignored: false });
    expect(hasPaperStatePatch(patch)).toBe(true);
    expect(hasPaperStatePatch({})).toBe(false);
  });

  it("applies state patches without clearing unrelated fields", () => {
    expect(
      applyPaperStatePatch(
        {
          favorited: true,
          read: false,
          ignored: false,
          recommendedAt: new Date("2026-06-18T00:00:00.000Z")
        },
        { read: true }
      )
    ).toMatchObject({
      favorited: true,
      read: true,
      ignored: false
    });

    expect(applyPaperStatePatch(null, { ignored: true })).toMatchObject({
      favorited: false,
      read: false,
      ignored: true,
      recommendedAt: null
    });
  });
});
