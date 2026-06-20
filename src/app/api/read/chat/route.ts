import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paper } from "@/lib/db/schema";
import { requireApiUser } from "@/lib/app/authz";
import { withApiErrorHandling } from "@/lib/app/api-route";
import { getDecryptedLlmConfig } from "@/lib/app/settings";
import { normalizeUserChatMessages, streamChatCompletion } from "@/lib/llm/streaming";
import type { ChatMessage, UserChatMessage } from "@/lib/llm/streaming";
import { assertManualLlmAllowed, finishLlmCall, startLlmCall } from "@/lib/app/llm-usage";
import { loadPaperPdfText, MAX_PDF_PROMPT_CHARS } from "@/lib/app/pdf";

async function post(request: Request) {
  const user = await requireApiUser();

  let body: { paperId?: string; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { paperId, messages } = body;
  if (!paperId) {
    return Response.json({ ok: false, error: "paperId is required" }, { status: 400 });
  }

  let normalizedMessages: UserChatMessage[];
  try {
    normalizedMessages = normalizeUserChatMessages(messages);
  } catch {
    return Response.json({ ok: false, error: "paperId and messages are required" }, { status: 400 });
  }

  const row = await db.query.paper.findFirst({ where: eq(paper.arxivId, paperId) });
  if (!row) {
    return Response.json({ ok: false, error: "Paper not found" }, { status: 404 });
  }

  const llmConfig = await getDecryptedLlmConfig(user.id);
  if (!llmConfig) {
    return Response.json(
      { ok: false, error: "请先在个人设置中配置 LLM 模型" },
      { status: 400 }
    );
  }
  try {
    await assertManualLlmAllowed(user.id);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "AI 阅读调用受限" }, { status: 429 });
  }

  const pdf = await loadPaperPdfText(row);

  const contextBlock = pdf.text
    ? `\n\n以下是论文全文内容（已截断至 ${MAX_PDF_PROMPT_CHARS} 字符）：\n\n${pdf.text.slice(0, MAX_PDF_PROMPT_CHARS)}`
    : `\n\n（无法获取论文全文，仅提供摘要信息。${pdf.error ? `原因：${pdf.error}` : ""}）`;

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
    ...normalizedMessages
  ];
  const call = await startLlmCall({
    userId: user.id,
    paperId,
    endpoint: "read-chat",
    model: llmConfig.model,
    promptChars: fullMessages.reduce((total, message) => total + message.content.length, 0),
    usedPdfText: Boolean(pdf.text)
  });

  const stream = streamChatCompletion(llmConfig, fullMessages, {
    signal: request.signal,
    onFinish: ({ completionChars, usage, error }) => finishLlmCall(call.id, {
      status: error ? "failed" : "succeeded",
      completionChars,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
      error
    })
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
