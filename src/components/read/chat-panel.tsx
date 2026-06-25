"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Copy, Download, ExternalLink, EyeOff, RefreshCw, Send, Settings, Star, Trash2 } from "lucide-react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { renderReadChatTranscriptMarkdown } from "@/lib/read/chat-transcript";
import { cn } from "@/lib/utils";
import { describeLlmFailureForUser, type LlmFailureCategory } from "@/lib/llm/failure";

type Message = { role: "user" | "assistant"; content: string; error?: boolean; errorType?: LlmFailureCategory; errorLabel?: string; actionHint?: string };
type PdfContextStatus = "fulltext" | "abstract-only" | null;
type ReadStreamError = { message: string; errorType?: LlmFailureCategory; errorLabel?: string; actionHint?: string };

type Props = {
  paper: ScoredPaper;
  paperState: { favorited: boolean; read: boolean; ignored?: boolean };
  onPaperStateChange: (state: Partial<Props["paperState"]>) => void | Promise<void>;
  onBack: () => void;
  llmConfigured: boolean;
};

async function readSseStream(
  res: Response,
  onChunk: (content: string) => void,
  onError?: (error: ReadStreamError) => void
) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed.error === "string") {
          const fallback = describeLlmFailureForUser(parsed.error);
          onError?.({
            message: parsed.error,
            errorType: typeof parsed.errorType === "string" ? parsed.errorType : fallback.category,
            errorLabel: typeof parsed.errorLabel === "string" ? parsed.errorLabel : fallback.label,
            actionHint: typeof parsed.actionHint === "string" ? parsed.actionHint : fallback.actionHint
          });
          continue;
        }
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) onChunk(chunk);
      } catch {
        // partial chunk
      }
    }
  }
}

function pdfContextStatus(res: Response): PdfContextStatus {
  return res.headers.get("x-daily-arxiv-pdf-text") === "0" ? "abstract-only" : "fulltext";
}

function errorActionHint(error: string, actionHint?: string) {
  return actionHint ?? describeLlmFailureForUser(error).actionHint;
}

export function ChatPanel({ paper, paperState, onPaperStateChange, onBack, llmConfigured }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryErrorHint, setSummaryErrorHint] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRetryKey, setSummaryRetryKey] = useState(0);
  const [pdfContext, setPdfContext] = useState<PdfContextStatus>(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const lastPaperIdRef = useRef<string | null>(null);

  // Reset and fetch summary when paper changes
  useEffect(() => {
    const paperChanged = lastPaperIdRef.current !== paper.arxivId;
    lastPaperIdRef.current = paper.arxivId;
    summaryAbortRef.current?.abort();
    if (paperChanged) {
      chatAbortRef.current?.abort();
      setMessages([]);
      setInput("");
      setIsLoading(false);
      setCopiedMessageIndex(null);
    }
    setSummary("");
    setSummaryError("");
    setSummaryErrorHint("");
    setSummaryLoading(false);
    setPdfContext(null);

    if (!llmConfigured) return;

    let cancelled = false;
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setSummaryLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/read/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ paperId: paper.arxivId })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "摘要请求失败" }));
          if (!cancelled) {
            const message = `摘要生成失败：${err.error ?? "未知错误"}`;
            setSummaryError(message);
            setSummaryErrorHint(typeof err.actionHint === "string" ? err.actionHint : errorActionHint(message));
          }
          return;
        }
        if (!cancelled) setPdfContext(pdfContextStatus(res));
        if (cancelled) {
          return;
        }
        await readSseStream(
          res,
          (chunk) => {
            if (!cancelled) setSummary((prev) => prev + chunk);
          },
          (err) => {
            if (!cancelled) {
              setSummaryError(`摘要生成失败：${err.message}`);
              setSummaryErrorHint(err.actionHint ?? errorActionHint(err.message));
            }
          }
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setSummaryError("摘要生成失败，请稍后重试。");
          setSummaryErrorHint(errorActionHint("network error"));
        }
      } finally {
        if (summaryAbortRef.current === controller) summaryAbortRef.current = null;
        if (!cancelled) setSummaryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (summaryAbortRef.current === controller) summaryAbortRef.current = null;
    };
  }, [paper.arxivId, llmConfigured, summaryRetryKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, summary]);

  async function send() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/read/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ paperId: paper.arxivId, messages: nextMessages })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        const message = `错误：${err.error ?? "未知错误"}`;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: message,
            error: true,
            actionHint: typeof err.actionHint === "string" ? err.actionHint : errorActionHint(message)
          };
          return updated;
        });
        return;
      }
      setPdfContext(pdfContextStatus(res));

      await readSseStream(
        res,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
            return updated;
          });
        },
        (err) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: `错误：${err.message}`,
              error: true,
              errorType: err.errorType,
              errorLabel: err.errorLabel,
              actionHint: err.actionHint
            };
            return updated;
          });
        }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "网络错误，请稍后重试。",
          error: true,
          errorType: "network",
          errorLabel: "网络/代理",
          actionHint: errorActionHint("network error")
        };
        return updated;
      });
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
        setIsLoading(false);
      }
    }
  }

  async function updatePaperState(next: Partial<Props["paperState"]>) {
    await onPaperStateChange(next);
  }

  function downloadSummary() {
    const markdown = [
      `# ${paper.title}`,
      "",
      `arXiv: ${paper.arxivUrl}`,
      "",
      summary
    ].join("\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${paper.arxivId}-summary.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadTranscript() {
    const markdown = renderReadChatTranscriptMarkdown({
      paperTitle: paper.title,
      arxivId: paper.arxivId,
      arxivUrl: paper.arxivUrl,
      summary,
      messages
    });
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${paper.arxivId}-chat.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyAnswer(content: string, index: number) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(content).catch(() => undefined);
    }
    setCopiedMessageIndex(index);
    window.setTimeout(() => setCopiedMessageIndex((current) => current === index ? null : current), 1200);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function retryQuestion(index: number) {
    const previous = [...messages.slice(0, index)].reverse().find((message) => message.role === "user");
    if (previous) setInput(previous.content);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Paper header */}
      <div className="neu-card flex-shrink-0 px-4 py-3">
        <div className="flex items-start gap-2">
          <button onClick={onBack} className="mt-0.5 text-muted-foreground lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium text-accent">AI 分析</p>
            <h2 className="text-sm font-semibold leading-snug">{paper.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {paper.authors.join(", ")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="neu-inset rounded px-1.5 py-0.5 text-xs">
                {paper.primaryCategory}
              </span>
              <button
                className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", paperState.read ? "text-accent" : "text-muted-foreground")}
                onClick={() => updatePaperState({ read: !paperState.read })}
                type="button"
              >
                <BookOpen className="h-3 w-3" />
                已读
              </button>
              <button
                className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", paperState.favorited ? "text-yellow-500" : "text-muted-foreground")}
                onClick={() => updatePaperState({ favorited: !paperState.favorited })}
                type="button"
              >
                <Star className={cn("h-3 w-3", paperState.favorited && "fill-current")} />
                收藏
              </button>
              <button
                className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", paperState.ignored ? "text-red-500" : "text-muted-foreground")}
                onClick={() => updatePaperState({ ignored: !paperState.ignored })}
                type="button"
              >
                <EyeOff className="h-3 w-3" />
                忽略
              </button>
              <a
                href={paper.arxivUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                arXiv <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* LLM config warning */}
      {!llmConfigured && (
        <div className="flex-shrink-0 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span>
              AI 功能需要先配置大语言模型。
            </span>
            <Link
              href="/settings"
              className="ml-auto inline-flex items-center gap-1 font-medium hover:underline"
            >
              前往设置 <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Summary */}
      {llmConfigured && (
        <div className="flex-shrink-0 neu-card px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>AI 分析摘要</span>
            {summary ? (
              <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={downloadSummary} type="button">
                <Download className="h-3 w-3" />
                Markdown
              </button>
            ) : null}
          </div>
          {summaryLoading && !summary && (
            <div className="space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          )}
          {summary && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {summary}
            </div>
          )}
          {pdfContext === "abstract-only" ? (
            <p className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
              未能读取 PDF 全文，本次 AI 阅读会基于标题和摘要回答；可以打开 arXiv PDF 检查原文，或稍后重试摘要。
            </p>
          ) : null}
          {summaryError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              <p>{summaryError}</p>
              <p className="mt-1 text-xs">{errorActionHint(summaryError, summaryErrorHint)}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                <button
                  className="inline-flex items-center gap-1 hover:underline"
                  onClick={() => setSummaryRetryKey((current) => current + 1)}
                  type="button"
                >
                  <RefreshCw className="h-3 w-3" />
                  重试摘要
                </button>
                <Link href="/settings" className="inline-flex items-center gap-1 hover:underline">
                  <Settings className="h-3 w-3" />
                  检查模型配置
                </Link>
              </div>
            </div>
          ) : null}
          {summaryLoading && summary && (
            <span className="inline-block animate-pulse text-muted-foreground">|</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {llmConfigured && (
          <div className="sticky top-0 z-10 mb-2 flex flex-wrap justify-end gap-2 bg-background/80 py-1 backdrop-blur">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
              disabled={messages.length === 0 || isLoading}
              onClick={() => setMessages([])}
              type="button"
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
              disabled={messages.length === 0}
              onClick={downloadTranscript}
              type="button"
            >
              <Download className="h-3 w-3" />
              下载会话
            </button>
          </div>
        )}
        {messages.length === 0 && llmConfigured && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              基于原文向 AI 提问
            </p>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "neu-inset"
                )}
              >
                {msg.error ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-600 dark:text-red-300">
                    <p>{msg.content}</p>
                    {msg.errorLabel ? <p className="mt-1 text-xs font-medium">错误类型：{msg.errorLabel}</p> : null}
                    <p className="mt-1 text-xs">{errorActionHint(msg.content, msg.actionHint)}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                      <button className="inline-flex items-center gap-1 hover:underline" onClick={() => retryQuestion(i)} type="button">
                        <RefreshCw className="h-3 w-3" />
                        重新填入问题
                      </button>
                      <Link href="/settings" className="inline-flex items-center gap-1 hover:underline">
                        <Settings className="h-3 w-3" />
                        检查模型配置
                      </Link>
                    </div>
                  </div>
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && isLoading && i === messages.length - 1 && !msg.content && (
                  <span className="inline-block animate-pulse">|</span>
                )}
                {msg.role === "assistant" && msg.content && !msg.error ? (
                  <button
                    className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => copyAnswer(msg.content, i)}
                    type="button"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedMessageIndex === i ? "已复制" : "复制回答"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0">
        <div className="flex gap-2">
          <input
            className="neu-input h-10 flex-1 px-3 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={llmConfigured ? "输入关于原文、方法或实验的问题..." : "请先配置 LLM 模型"}
            disabled={isLoading || !llmConfigured}
          />
          <button
            onClick={send}
            disabled={isLoading || !input.trim() || !llmConfigured}
            className="neu-btn-primary inline-flex h-10 items-center gap-1.5 px-4 text-sm disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
