import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { paper, paperSummary } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { streamChatCompletion } from "@/lib/llm/streaming";
import { assertManualLlmAllowed, finishLlmCall, startLlmCall } from "@/lib/app/llm-usage";
import { loadPaperPdfText, MAX_PDF_PROMPT_CHARS } from "@/lib/app/pdf";

const READ_SUMMARY_PROMPT_VERSION = "read-summary-markdown-v1";

function markdownSummaryStream(summary: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        choices: [{ delta: { content: summary } }]
      })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

async function post(request: Request) {
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

  const cachedSummary = await db.query.paperSummary.findFirst({
    where: and(
      eq(paperSummary.userId, user.id),
      eq(paperSummary.paperId, paperId),
      eq(paperSummary.promptVersion, READ_SUMMARY_PROMPT_VERSION)
    ),
    orderBy: desc(paperSummary.createdAt)
  });
  if (cachedSummary?.summaryZh) {
    return new Response(markdownSummaryStream(cachedSummary.summaryZh), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Daily-Arxiv-Summary-Cache": "HIT"
      }
    });
  }

  const llmConfig = await getDecryptedLlmConfig(user.id);
  if (!llmConfig) {
    return Response.json({ ok: false, error: "LLM 未配置" }, { status: 400 });
  }
  try {
    await assertManualLlmAllowed(user.id);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "AI 阅读调用受限" }, { status: 429 });
  }

  const pdf = await loadPaperPdfText(row);

  const contextBlock = pdf.text
    ? `\n\n论文全文（截断至 ${MAX_PDF_PROMPT_CHARS} 字符）：\n\n${pdf.text.slice(0, MAX_PDF_PROMPT_CHARS)}`
    : `\n\n（无法获取论文全文，仅基于摘要生成总结。${pdf.error ? `原因：${pdf.error}` : ""}）`;

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
  const call = await startLlmCall({
    userId: user.id,
    paperId,
    endpoint: "read-summary",
    model: llmConfig.model,
    promptChars: systemPrompt.length,
    usedPdfText: Boolean(pdf.text)
  });
  const summaryChunks: string[] = [];

  const stream = streamChatCompletion(llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: "请总结这篇论文。" }
  ], {
    signal: request.signal,
    onDeltaContent: (content) => {
      summaryChunks.push(content);
    },
    onFinish: async ({ completionChars, usage, error }) => {
      await finishLlmCall(call.id, {
        status: error ? "failed" : "succeeded",
        completionChars,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        error
      });
      const summaryMarkdown = summaryChunks.join("").trim();
      if (!error && summaryMarkdown) {
        await db.insert(paperSummary).values({
          id: randomUUID(),
          userId: user.id,
          paperId,
          titleOriginal: row.title,
          titleZh: row.title,
          abstractOriginal: row.abstract,
          abstractZh: row.abstract,
          oneSentenceSummaryZh: summaryMarkdown.replace(/\s+/g, " ").slice(0, 30) || row.title.slice(0, 30),
          summaryZh: summaryMarkdown,
          model: llmConfig.model,
          promptVersion: READ_SUMMARY_PROMPT_VERSION,
          rawResponse: { markdown: summaryMarkdown, source: "read-summary" },
          createdAt: new Date()
        });
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Daily-Arxiv-Pdf-Source": pdf.source,
      "X-Daily-Arxiv-Pdf-Text": pdf.text ? "1" : "0"
    }
  });
}

export const POST = withApiErrorHandling(post);
