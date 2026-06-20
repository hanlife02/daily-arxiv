import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

let servers: Server[] = [];
let sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
    setTimeout(resolve, 1000).unref();
  })));
  servers = [];
  sockets = [];
});

function cleanEnv(extra: Record<string, string>) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPS_FAILURE_SAMPLE_")) delete env[key];
  }
  delete env.COMPOSE_FILE;
  return { ...env, ...extra };
}

async function runFailureSamples(dir: string, extraEnv: Record<string, string>) {
  const outputBase = join(dir, "failure-samples");
  const child = spawn(process.execPath, ["scripts/ops-failure-samples.mjs"], {
    cwd: process.cwd(),
    env: cleanEnv({
      OPS_FAILURE_SAMPLE_OUTPUT_BASE: outputBase,
      OPS_FAILURE_SAMPLE_COMPOSE_FILE: join(dir, "missing-compose.yml"),
      OPS_FAILURE_SAMPLE_TIMEOUT_MS: "3000",
      ...extraEnv
    })
  });
  let stdout = "";
  let stderr = "";
  let status: number | null = null;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      status = code;
      resolve();
    });
  });
  return {
    result: { status, stdout, stderr },
    payload: JSON.parse(readFileSync(`${outputBase}.json`, "utf8")),
    markdown: readFileSync(`${outputBase}.md`, "utf8")
  };
}

async function startFailureServer() {
  const requests: Array<{ method?: string; url?: string; authorization?: string; body: string }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body
      });
      if (request.url === "/pdf/not-found") {
        response.writeHead(404, {
          "connection": "close",
          "content-type": "text/plain",
          "x-secret-token": "must-not-appear",
          "x-visible": "pdf-request"
        }).end("pdf missing");
        return;
      }
      if (request.url === "/v1/chat/completions") {
        response.writeHead(401, {
          "connection": "close",
          "content-type": "application/json",
          "x-request-id": "req_failure_sample",
          "x-secret-key": "must-not-appear"
        }).end("{\"error\":{\"code\":\"invalid_model\",\"message\":\"model is unavailable\"}}");
        return;
      }
      response.writeHead(404, { "connection": "close" }).end("not found");
    });
  });
  server.keepAliveTimeout = 1;
  server.on("connection", (socket) => {
    sockets.push(socket);
    socket.on("close", () => {
      sockets = sockets.filter((tracked) => tracked !== socket);
    });
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") reject(new Error("server address unavailable"));
      else resolve(address.port);
    });
  });
  servers.push(server);
  return { origin: `http://127.0.0.1:${port}`, requests };
}

describe("ops failure samples script", () => {
  it("captures PDF and LLM failure probes while redacting sensitive headers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-failure-samples-"));
    const { origin, requests } = await startFailureServer();
    const apiKey = "super-secret-failure-sample-key";

    const { result, payload, markdown } = await runFailureSamples(dir, {
      OPS_FAILURE_SAMPLE_EVIDENCE_LEVEL: "production",
      OPS_FAILURE_SAMPLE_PDF_URL: `${origin}/pdf/not-found`,
      OPS_FAILURE_SAMPLE_LLM_BASE_URL: origin,
      OPS_FAILURE_SAMPLE_LLM_API_KEY: apiKey,
      OPS_FAILURE_SAMPLE_LLM_MODEL: "missing-model"
    });

    expect(result.status).toBe(0);
    expect(payload.evidenceLevel).toBe("production");
    expect(payload.evidence).toMatchObject({ level: "production", pdfUrlKind: "loopback", llmUrlKind: "loopback" });
    const pdfProbe = payload.probes.find((probe: { kind: string }) => probe.kind === "pdf");
    const llmProbe = payload.probes.find((probe: { kind: string }) => probe.kind === "llm");
    expect(pdfProbe).toMatchObject({ ok: false, status: 404, bodySample: "pdf missing" });
    expect(pdfProbe.headers["x-visible"]).toBe("pdf-request");
    expect(pdfProbe.headers["x-secret-token"]).toBeUndefined();
    expect(llmProbe).toMatchObject({ ok: false, status: 401, model: "missing-model" });
    expect(llmProbe.headers["x-request-id"]).toBe("req_failure_sample");
    expect(llmProbe.headers["x-secret-key"]).toBeUndefined();
    expect(llmProbe.bodySample).toContain("invalid_model");
    expect(requests.find((request) => request.url === "/v1/chat/completions")?.authorization)
      .toBe(`Bearer ${apiKey}`);
    expect(JSON.stringify(payload)).not.toContain(apiKey);
    expect(markdown).not.toContain(apiKey);
    expect(markdown).toContain("Evidence level: production");
  });

  it("records skipped LLM probes and invalid PDF URL evidence metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-failure-samples-skip-"));

    const { result, payload, markdown } = await runFailureSamples(dir, {
      OPS_FAILURE_SAMPLE_PDF_URL: "not-a-url",
      OPS_FAILURE_SAMPLE_EVIDENCE_LEVEL: "local"
    });

    expect(result.status).toBe(0);
    expect(payload.evidence).toMatchObject({ pdfUrlKind: "invalid", llmUrlKind: "missing" });
    expect(payload.probes.find((probe: { kind: string }) => probe.kind === "pdf"))
      .toMatchObject({ kind: "pdf", ok: false });
    expect(payload.probes.find((probe: { kind: string }) => probe.kind === "llm"))
      .toMatchObject({ kind: "llm", skipped: true });
    expect(markdown).toContain("LLM URL kind: missing");
  });
});
