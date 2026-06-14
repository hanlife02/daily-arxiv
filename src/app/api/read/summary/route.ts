import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/app/authz";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { streamChatCompletion } from "@/lib/llm/streaming";

const MAX_PDF_CHARS = 80000;

export async function POST(request: Request) {
  const user = await requireApiUser();

  let body: { paperId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { paperId } = body;
  if (!paperId) {
    return Response.json({ ok: false, error: "paperId is required" }, { status: 400 });
  }

  const row = await db.query.paper.findFirst({ where: eq(paper.arxivId, paperId) });
  if (!row) {
    return Response.json({ ok: false, error: "Paper not found" }, { status: 404 });
  }

  const llmConfig = await getDecryptedLlmConfig(user.id);
  if (!llmConfig) {
    return Response.json({ ok: false, error: "LLM 未配置" }, { status: 400 });
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
      // fall back to abstract
    }
  }

  const contextBlock = pdfText
    ? `\n\n论文全文（截断至 ${MAX_PDF_CHARS} 字符）：\n\n${pdfText.slice(0, MAX_PDF_CHARS)}`
    : "\n\n（无法获取论文全文，仅基于摘要生成总结。）";

  const systemPrompt = [
    "你是一位学术论文阅读助手。请对以下论文进行全面总结。",
    "输出格式（Markdown）：",
    "## 一句话总结",
    "用一句中文概括论文核心贡献（不超过50字）。",
    "## 研究背景",
    "这篇论文要解决什么问题？为什么重要？（2-3句）",
    "## 核心方法",
    "作者用了什么方法？有什么创新点？（3-5句）",
    "## 主要结果",
    "实验结果如何？与现有方法相比如何？（2-3句）",
    "## 局限与未来方向",
    "论文有哪些不足？未来可能的研究方向？（1-2句）",
    "",
    `标题：${row.title}`,
    `作者：${row.authors.join(", ")}`,
    `分类：${row.categories.join(", ")}`,
    `摘要：${row.abstract}`,
    contextBlock
  ].join("\n");

  const stream = streamChatCompletion(llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: "请总结这篇论文。" }
  ]);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
