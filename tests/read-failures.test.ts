import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPaperPdfText, MAX_PDF_CACHE_CHARS } from "@/lib/app/pdf";
import { streamChatCompletion } from "@/lib/llm/streaming";
import { extractLlmUsageTokens } from "@/lib/llm/usage-tokens";

const dbMocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  PDFParse: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: dbMocks.update
  }
}));

vi.mock("pdf-parse", () => ({
  PDFParse: dbMocks.PDFParse
}));

function paperRow(overrides: Record<string, unknown> = {}) {
  return {
    arxivId: "2606.19001",
    title: "Failure-Aware Paper Reading",
    abstract: "A paper about robust reading workflows.",
    authors: ["Ada Lovelace"],
    categories: ["cs.AI"],
    primaryCategory: "cs.AI",
    arxivUrl: "https://arxiv.org/abs/2606.19001",
    pdfUrl: "https://arxiv.org/pdf/2606.19001",
    pdfText: null,
    publishedAt: new Date("2026-06-19T00:00:00.000Z"),
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
    ...overrides
  };
}

async function readTextStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

describe("PDF text loading failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    dbMocks.update.mockReturnValue({ set: dbMocks.set });
    dbMocks.set.mockReturnValue({ where: dbMocks.where });
    dbMocks.where.mockResolvedValue(undefined);
  });

  it("uses cached PDF text and caps cache length without refetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPaperPdfText(paperRow({
      pdfText: "a".repeat(MAX_PDF_CACHE_CHARS + 10)
    }) as never);

    expect(result).toMatchObject({ source: "cache" });
    expect(result.text).toHaveLength(MAX_PDF_CACHE_CHARS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("reports missing and failed PDF downloads without writing cache", async () => {
    const missing = await loadPaperPdfText(paperRow({ pdfUrl: null }) as never);
    expect(missing).toMatchObject({
      source: "missing",
      error: "PDF URL missing"
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const failed = await loadPaperPdfText(paperRow() as never);

    expect(failed).toMatchObject({
      source: "failed",
      error: "PDF download failed: 404"
    });
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("caches parsed PDF text with the cache length cap", async () => {
    const destroy = vi.fn();
    dbMocks.PDFParse.mockImplementation(function PDFParse() {
      return {
      getText: vi.fn().mockResolvedValue({ text: "p".repeat(MAX_PDF_CACHE_CHARS + 20) }),
      destroy
      };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pdf bytes")));

    const result = await loadPaperPdfText(paperRow() as never);

    expect(result).toMatchObject({ source: "downloaded" });
    expect(result.text).toHaveLength(MAX_PDF_CACHE_CHARS);
    expect(dbMocks.set).toHaveBeenCalledWith({ pdfText: "p".repeat(MAX_PDF_CACHE_CHARS) });
    expect(dbMocks.where).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("returns parse and network errors as PDF failures", async () => {
    dbMocks.PDFParse.mockImplementation(function PDFParse() {
      return {
      getText: vi.fn().mockRejectedValue(new Error("invalid xref table")),
      destroy: vi.fn()
      };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pdf bytes")));

    const parseFailure = await loadPaperPdfText(paperRow() as never);
    expect(parseFailure).toMatchObject({
      source: "failed",
      error: "invalid xref table"
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const networkFailure = await loadPaperPdfText(paperRow() as never);
    expect(networkFailure).toMatchObject({
      source: "failed",
      error: "ECONNRESET"
    });
  });
});

describe("LLM streaming failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("emits provider errors and records finish failure details", async () => {
    const onFinish = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));

    const output = await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }],
      { onFinish }
    ));

    expect(output).toContain("LLM request failed: 429 rate limited");
    expect(output).toContain('"errorType":"quota"');
    expect(output).toContain("调整 AI 阅读额度/供应商配额");
    expect(output).toContain("data: [DONE]");
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      error: "LLM request failed: 429 rate limited"
    }));
  });

  it("emits structured errors for non-SSE provider fragments and isolates finish logging failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("plain fragment\n\ndata: {\"delta\":\"ok\"}\n")));

    const output = await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }],
      {
        onFinish: () => {
          throw new Error("log write failed");
        }
      }
    ));

    expect(output).toContain("LLM stream invalid SSE fragment: plain fragment");
    expect(output).toContain('"errorType":"provider"');
    expect(output).toContain("供应商响应异常");
    expect(output).toContain("data: [DONE]");
  });

  it("emits structured errors for invalid JSON stream fragments", async () => {
    const onFinish = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data: {\"choices\"\n\n")));

    const output = await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }],
      { onFinish }
    ));

    expect(output).toContain("LLM stream invalid JSON fragment");
    expect(output).toContain('"errorType":"provider"');
    expect(output).toContain("data: [DONE]");
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining("LLM stream invalid JSON fragment")
    }));
  });

  it("extracts OpenAI-compatible usage tokens from streaming chunks", async () => {
    const onFinish = vi.fn();
    const onDeltaContent = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response([
      "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n",
      "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
      "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":5,\"total_tokens\":17}}\n\n",
      "data: [DONE]\n\n"
    ].join(""))));

    await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }],
      { onFinish, onDeltaContent }
    ));

    expect(onDeltaContent).toHaveBeenCalledTimes(2);
    expect(onDeltaContent.mock.calls.map((call) => call[0]).join("")).toBe("hello world");
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      usage: {
        promptTokens: 12,
        completionTokens: 5,
        totalTokens: 17
      }
    }));
  });

  it("retries streaming without usage options when a provider rejects stream_options", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unknown field stream_options", { status: 400 }))
      .mockResolvedValueOnce(new Response("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n"));
    vi.stubGlobal("fetch", fetchMock);

    const output = await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }]
    ));

    expect(output).toContain("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).stream_options).toEqual({ include_usage: true });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).stream_options).toBeUndefined();
  });

  it("turns fetch exceptions into a terminal error event", async () => {
    const onFinish = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));

    const output = await readTextStream(streamChatCompletion(
      { baseUrl: "https://llm.example/v1", apiKey: "key", model: "gpt-test" },
      [{ role: "user", content: "Summarize" }],
      { onFinish }
    ));

    expect(output).toContain("socket hang up");
    expect(output).toContain('"errorType":"network"');
    expect(output).toContain("data: [DONE]");
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      error: "socket hang up"
    }));
  });
});

describe("LLM usage token parsing", () => {
  it("accepts common OpenAI-compatible token field names", () => {
    expect(extractLlmUsageTokens({
      usage: {
        input_tokens: 20,
        output_tokens: 8
      }
    })).toEqual({
      promptTokens: 20,
      completionTokens: 8,
      totalTokens: 28
    });
  });
});
