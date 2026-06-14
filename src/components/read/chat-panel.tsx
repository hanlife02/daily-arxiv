"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Send, Settings } from "lucide-react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  paper: ScoredPaper;
  onBack: () => void;
  llmConfigured: boolean;
};

async function readSseStream(
  res: Response,
  onChunk: (content: string) => void,
  onError?: (msg: string) => void
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
        if (parsed.error) {
          onError?.(parsed.error);
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

export function ChatPanel({ paper, onBack, llmConfigured }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Reset and fetch summary when paper changes
  useEffect(() => {
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setSummary("");
    setSummaryLoading(false);

    if (!llmConfigured) return;

    let cancelled = false;
    setSummaryLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/read/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paperId: paper.arxivId })
        });
        if (!res.ok || cancelled) {
          setSummaryLoading(false);
          return;
        }
        await readSseStream(
          res,
          (chunk) => {
            if (!cancelled) setSummary((prev) => prev + chunk);
          },
          (err) => {
            if (!cancelled) setSummary(`摘要生成失败：${err}`);
          }
        );
      } catch {
        if (!cancelled) setSummary("摘要生成失败，请稍后重试。");
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [paper.arxivId, llmConfigured]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, summary]);

  async function send() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/read/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId: paper.arxivId, messages: nextMessages })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "请求失败" }));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: `错误：${err.error ?? "未知错误"}` };
          return updated;
        });
        return;
      }

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
            updated[updated.length - 1] = { role: "assistant", content: `错误：${err}` };
            return updated;
          });
        }
      );
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "网络错误，请稍后重试。" };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
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
            <h2 className="text-sm font-semibold leading-snug">{paper.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {paper.authors.join(", ")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="neu-inset rounded px-1.5 py-0.5 text-xs">
                {paper.primaryCategory}
              </span>
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
          <div className="mb-2 text-xs font-medium text-muted-foreground">AI 摘要</div>
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
          {summaryLoading && summary && (
            <span className="inline-block animate-pulse text-muted-foreground">|</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {messages.length === 0 && llmConfigured && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              向 AI 提问关于这篇论文的任何问题
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
                {msg.content}
                {msg.role === "assistant" && isLoading && i === messages.length - 1 && !msg.content && (
                  <span className="inline-block animate-pulse">|</span>
                )}
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
            placeholder={llmConfigured ? "输入你的问题..." : "请先配置 LLM 模型"}
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
