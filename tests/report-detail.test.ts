import { describe, expect, it } from "vitest";
import { buildReportPaperDetails, diffReportVersionPaperIds, matchesReportPaperDetailQuery, reportPaperVersionChange } from "@/lib/app/report-detail";
import { paper as paperRecord } from "./helpers";

function paperRow(overrides: Partial<ReturnType<typeof paperRecord>> = {}) {
  const record = paperRecord(overrides);
  return {
    ...record,
    latestVersion: "v1",
    pdfUrl: record.pdfUrl ?? null,
    pdfText: null,
    firstSeenAt: new Date("2026-06-13T10:00:00.000Z")
  };
}

const preference = {
  userId: "user-1",
  categories: ["cs.CL"],
  includeKeywords: ["retrieval"],
  excludeKeywords: [],
  categoryWeights: { "cs.CL": 2 },
  topN: 5,
  sendTime: "09:00",
  timezone: "Asia/Shanghai",
  summaryFocus: "methods",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z")
};

describe("report detail helpers", () => {
  it("diffs report versions with added, removed, and moved paper ids", () => {
    const diff = diffReportVersionPaperIds(
      ["2501.00001", "2501.00002", "2501.00003"],
      ["2501.00002", "2501.00004", "2501.00001"]
    );

    expect(diff.added).toEqual(["2501.00004"]);
    expect(diff.removed).toEqual(["2501.00003"]);
    expect(diff.moved).toEqual(["2501.00002", "2501.00001"]);
    expect(diff.reordered).toBe(false);

    expect(diffReportVersionPaperIds(["a", "b"], ["b", "a"])).toMatchObject({
      added: [],
      removed: [],
      moved: ["b", "a"],
      reordered: true
    });
    expect(reportPaperVersionChange(diff, "2501.00004")).toBe("added");
    expect(reportPaperVersionChange(diff, "2501.00002")).toBe("moved");
    expect(reportPaperVersionChange(diff, "2501.99999")).toBe("unchanged");
  });

  it("builds ordered report paper details with scores and explanations", () => {
    const details = buildReportPaperDetails({
      paperIds: ["2501.00002", "2501.00001", "2501.99999"],
      papers: [
        paperRow({ arxivId: "2501.00001", title: "Retrieval Agents for Literature Review" }),
        paperRow({ arxivId: "2501.00002", title: "Open-Source Retrieval Benchmark" })
      ],
      metrics: [
        {
          arxivId: "2501.00002",
          avgHIndex: 55,
          strongAuthorCount: 3,
          peakHIndex: 90,
          referencesCount: 42,
          s2Status: "ok",
          error: null,
          fetchedAt: new Date("2026-06-13T10:00:00.000Z")
        }
      ],
      preference,
      now: new Date("2026-06-18T12:00:00.000Z")
    });

    expect(details.map((detail) => detail.arxivId)).toEqual(["2501.00002", "2501.00001", "2501.99999"]);
    expect(details[0]?.title).toBe("Open-Source Retrieval Benchmark");
    expect(details[0]?.abstractPreview).toContain("retrieval augmented generation");
    expect(details[0]?.score).toBeGreaterThan(0);
    expect(details[0]?.reasons.length).toBeGreaterThan(0);
    expect(matchesReportPaperDetailQuery(details[0]!, "benchmark")).toBe(true);
    expect(matchesReportPaperDetailQuery(details[0]!, "cs.CL")).toBe(true);
    expect(matchesReportPaperDetailQuery(details[0]!, "not-present")).toBe(false);
    expect(details[2]).toMatchObject({
      title: "2501.99999",
      abstractPreview: null,
      score: null,
      missing: true,
      reasons: ["论文元数据缺失"]
    });
  });
});
