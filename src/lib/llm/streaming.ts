import type { LlmConfig } from "@/lib/llm/chat-completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function streamChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number }
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const endpoint = new URL("/v1/chat/completions", config.baseUrl);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            temperature: options?.temperature ?? 0.3,
            stream: true,
            messages
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `LLM request failed: ${response.status} ${errText}` })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const reader = response.body!.getReader();
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
            controller.enqueue(encoder.encode(trimmed + "\n\n"));
          }
        }

        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer.trim() + "\n\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      }

      controller.close();
    }
  });
}
