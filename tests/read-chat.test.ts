import { describe, expect, it } from "vitest";
import { renderReadChatTranscriptMarkdown } from "@/lib/read/chat-transcript";

describe("read chat transcript markdown", () => {
  it("renders paper metadata, summary, and messages", () => {
    const markdown = renderReadChatTranscriptMarkdown({
      paperTitle: "Efficient Language Model Retrieval",
      arxivId: "2501.12345",
      arxivUrl: "https://arxiv.org/abs/2501.12345",
      summary: "## 一句话总结\n提出高效检索方法。",
      messages: [
        { role: "user", content: "核心贡献是什么？" },
        { role: "assistant", content: "核心贡献是减少检索成本。" }
      ]
    });

    expect(markdown).toContain("# Efficient Language Model Retrieval");
    expect(markdown).toContain("- arXiv ID: 2501.12345");
    expect(markdown).toContain("## AI 摘要");
    expect(markdown).toContain("### 1. 用户");
    expect(markdown).toContain("### 2. 助手");
    expect(markdown).toContain("核心贡献是减少检索成本。");
  });

  it("renders an empty transcript state", () => {
    expect(
      renderReadChatTranscriptMarkdown({
        paperTitle: "Paper",
        arxivId: "2501.00001",
        arxivUrl: "https://arxiv.org/abs/2501.00001",
        messages: []
      })
    ).toContain("暂无问答。");
  });
});
