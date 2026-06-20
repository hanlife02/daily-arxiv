export function normalizeLlmBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Base URL is required");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid LLM Base URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("LLM Base URL must use http or https");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function chatCompletionsEndpoint(baseUrl: string) {
  const normalized = normalizeLlmBaseUrl(baseUrl);
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/chat/completions")) {
    return url;
  }

  url.pathname = path.endsWith("/v1") ? `${path}/chat/completions` : `${path}/v1/chat/completions`;
  return url;
}
