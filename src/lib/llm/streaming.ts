import type { LlmConfig } from "@/lib/llm/chat-completions";
import { chatCompletionsEndpoint } from "@/lib/llm/endpoint";
import { extractLlmUsageTokens, type LlmUsageTokens } from "@/lib/llm/usage-tokens";
import { buildLlmErrorStreamEvent } from "@/lib/llm/failure";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type UserChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const USER_CHAT_ROLES = new Set(["user", "assistant"]);

export function normalizeUserChatMessages(
  input: unknown,
  options: { maxMessages?: number; maxContentChars?: number } = {}
): UserChatMessage[] {
  if (!Array.isArray(input)) {
    throw new Error("messages must be an array");
  }

  const maxMessages = options.maxMessages ?? 20;
  const maxContentChars = options.maxContentChars ?? 4_000;
  const messages = input.slice(-maxMessages).map((message) => {
    if (!message || typeof message !== "object") {
      throw new Error("messages must contain objects");
    }
    const role = "role" in message ? message.role : undefined;
    const content = "content" in message ? message.content : undefined;
    if (typeof role !== "string" || !USER_CHAT_ROLES.has(role)) {
      throw new Error("messages can only use user or assistant roles");
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("message content is required");
    }
    return {
      role: role as UserChatMessage["role"],
      content: content.slice(0, maxContentChars)
    };
  });

  if (messages.length === 0) {
    throw new Error("at least one message is required");
  }

  return messages;
}

export function streamChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: {
    signal?: AbortSignal;
    temperature?: number;
    onDeltaContent?: (content: string) => Promise<void> | void;
    onFinish?: (result: { completionChars: number; usage?: LlmUsageTokens; error?: string }) => Promise<void> | void;
  }
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let completionChars = 0;
      let usage: LlmUsageTokens | undefined;
      let finishError: string | undefined;
      const enqueueTerminalError = (message: string) => {
        finishError = message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(buildLlmErrorStreamEvent(message))}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      };
      const finish = async () => {
        try {
          await options?.onFinish?.({ completionChars, usage, error: finishError });
        } catch {
          // Logging/metrics failures must not break the response stream.
        }
      };

      try {
        const endpoint = chatCompletionsEndpoint(config.baseUrl);
        const requestStream = (includeUsage: boolean) => fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`
          },
          signal: options?.signal,
          body: JSON.stringify({
            model: config.model,
            temperature: options?.temperature ?? 0.3,
            stream: true,
            ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
            messages
          })
        });

        let response = await requestStream(true);
        if (!response.ok) {
          let errText = await response.text().catch(() => "unknown error");
          if (response.status === 400 && /\b(stream_options|include_usage)\b/i.test(errText)) {
            response = await requestStream(false);
            errText = response.ok ? "" : await response.text().catch(() => "unknown error");
          }
          if (!response.ok) {
            enqueueTerminalError(`LLM request failed: ${response.status} ${errText}`);
            controller.close();
            await finish();
            return;
          }
        }

        if (!response.body) {
          enqueueTerminalError("LLM request failed: empty stream response body");
          controller.close();
          await finish();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const validationError = validateStreamLine(trimmed);
            if (validationError) {
              enqueueTerminalError(validationError);
              controller.close();
              await finish();
              return;
            }
            if (trimmed.startsWith(":")) continue;
            const lineUsage = parseStreamUsage(trimmed);
            if (lineUsage) usage = lineUsage;
            const deltaContent = parseStreamDeltaContent(trimmed);
            if (deltaContent) await options?.onDeltaContent?.(deltaContent);
            completionChars += trimmed.length;
            controller.enqueue(encoder.encode(trimmed + "\n\n"));
          }
        }

        if (buffer.trim()) {
          const trimmed = buffer.trim();
          const validationError = validateStreamLine(trimmed);
          if (validationError) {
            enqueueTerminalError(validationError);
            controller.close();
            await finish();
            return;
          }
          if (trimmed.startsWith(":")) {
            await finish();
            controller.close();
            return;
          }
          const lineUsage = parseStreamUsage(trimmed);
          if (lineUsage) usage = lineUsage;
          const deltaContent = parseStreamDeltaContent(trimmed);
          if (deltaContent) await options?.onDeltaContent?.(deltaContent);
          completionChars += trimmed.length;
          controller.enqueue(encoder.encode(trimmed + "\n\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        enqueueTerminalError(message);
      }

      await finish();
      controller.close();
    }
  });
}

function trimStreamFragment(value: string) {
  return value.length > 180 ? `${value.slice(0, 180)}...` : value;
}

function validateStreamLine(line: string) {
  if (line.startsWith(":")) return undefined;
  if (!line.startsWith("data:")) {
    return `LLM stream invalid SSE fragment: ${trimStreamFragment(line)}`;
  }

  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return undefined;
  try {
    JSON.parse(payload);
    return undefined;
  } catch {
    return `LLM stream invalid JSON fragment: ${trimStreamFragment(payload)}`;
  }
}

function parseStreamUsage(line: string) {
  const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (!payload || payload === "[DONE]") return undefined;
  try {
    return extractLlmUsageTokens(JSON.parse(payload));
  } catch {
    return undefined;
  }
}

function parseStreamDeltaContent(line: string) {
  const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (!payload || payload === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : undefined;
  } catch {
    return undefined;
  }
}
