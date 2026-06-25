import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { DailySummaryCliError, parseDailySummaryArgs } from "@/lib/daily/summary";

const execFileAsync = promisify(execFile);

describe("daily summary CLI", () => {
  it("writes deterministic mock markdown when using an arXiv fixture", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "daily-summary-"));
    const outputPath = join(outputDir, "summary.md");

    await execFileAsync("pnpm", [
      "daily:summary",
      "--",
      "--fixture",
      "tests/fixtures/arxiv-feed.xml",
      "--mock-llm",
      "--limit",
      "1",
      "--batch-date",
      "2026-06-24",
      "--output",
      outputPath
    ]);

    const markdown = await readFile(outputPath, "utf8");
    expect(markdown).toContain("# daily-arxiv 日报");
    expect(markdown).toContain("批次：2026-06-24");
    expect(markdown).toContain("## 1. 模拟摘要：Efficient Agents for Scientific Literature Review");
    expect(markdown).toContain("- arXiv ID：2606.12345");
    expect(markdown).toContain("- 一句话：模拟总结突出论文贡献");
    expect(markdown).not.toContain("2606.23456");
  });

  it("rejects malformed numeric and calendar arguments", () => {
    expect(() => parseDailySummaryArgs(["--limit", "1abc"])).toThrow(DailySummaryCliError);
    expect(() => parseDailySummaryArgs(["--batch-date", "2026-99-99"])).toThrow(DailySummaryCliError);
  });
});
