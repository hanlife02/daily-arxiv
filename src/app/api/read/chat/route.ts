import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/app/authz";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { streamChatCompletion } from "@/lib/llm/streaming";
import type { ChatMessage } from "@/lib/llm/streaming";

const MAX_PDF_CHARS = 80000;

export async function POST(request: Request) {
  const user = await requireApiUser();

  let body: { paperId?: string; messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { paperId, messages } = body;
  if (!paperId || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ ok: false, error: "paperId and messages are required" }, { status: 400 });
  }

  const row = await db.query.paper.findFirst({ where: eq(paper.arxivId, paperId) });
  if (!row) {
    return Response.json({ ok: false, error: "Paper not found" }, { status: 404 });
  }

  let pdfText = row.pdfText;
  if (!pdfText && row.pdfUrl) {
    try {
      const res = await fetch(row.pdfUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        pdfText = result.text;
        await db.update(paper).set({ pdfText }).where(eq(paper.arxivId, paperId));
      }
    } catch {
      // PDF download/parse failed — fall back to abstract only
    }
  }

  const llmConfig = await getDecryptedLlmConfig(user.id);
  if (!llmConfig) {
    return Response.json(
      { ok: false, error: "请先在个人设置中配置 LLM 模型" },
      { status: 400 }
    );
  }

  const contextBlock = pdfText
    ? `\n\n以下是论文全文内容（已截断至 ${MAX_PDF_CHARS} 字符）：\n\n${pdfText.slice(0, MAX_PDF_CHARS)}`
    : "\n\n（无法获取论文全文，仅提供摘要信息。）";

  const systemPrompt = [
    "你是一位学术论文阅读助手。根据用户提供的论文内容回答问题。",
    "回答应该准确、具体，并尽量引用论文中的原文或图表编号。",
    "如果论文内容中没有相关信息，请如实说明。",
    "使用中文回答。",
    `标题：${row.title}`,
    `作者：${row.authors.join(", ")}`,
    `分类：${row.categories.join(", ")}`,
    `摘要：${row.abstract}`,
    `链接：${row.arxivUrl}`,
    contextBlock
  ].join("\n");

  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content }))
  ];

  const stream = streamChatCompletion(llmConfig, fullMessages);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
