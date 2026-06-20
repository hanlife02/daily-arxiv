export type ReadChatTranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};

export function renderReadChatTranscriptMarkdown(input: {
  paperTitle: string;
  arxivId: string;
  arxivUrl: string;
  summary?: string;
  messages: ReadChatTranscriptMessage[];
}) {
  const lines = [
    `# ${input.paperTitle}`,
    "",
    `- arXiv ID: ${input.arxivId}`,
    `- arXiv URL: ${input.arxivUrl}`,
    ""
  ];

  if (input.summary?.trim()) {
    lines.push("## AI 摘要", "", input.summary.trim(), "");
  }

  lines.push("## 问答历史", "");
  if (input.messages.length === 0) {
    lines.push("暂无问答。");
  } else {
    for (const [index, message] of input.messages.entries()) {
      lines.push(`### ${index + 1}. ${message.role === "user" ? "用户" : "助手"}`, "", message.content.trim() || "（空）", "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
