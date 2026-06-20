import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

function baseEnv(overrides: Record<string, string> = {}) {
  return {
    APP_URL: "https://daily-arxiv.org",
    BETTER_AUTH_URL: "https://daily-arxiv.org",
    BETTER_AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
    FIELD_ENCRYPTION_KEY: "zyxwvutsrqponmlkjihgfedcba654321",
    ADMIN_EMAIL: "ops@daily-arxiv.org",
    ADMIN_PASSWORD: "CorrectHorseBatteryStaple42!",
    SMTP_HOST: "smtp.mailserver.org",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_FROM: "Daily arXiv <noreply@daily-arxiv.org>",
    BACKUP_RETENTION_DAYS: "14",
    DATA_DIR: "/var/lib/daily-arxiv",
    LLM_COST_RATES_JSON: "{\"gpt-test\":{\"inputPer1M\":1,\"outputPer1M\":2}}",
    ...overrides
  };
}

function writeEnvFile(dir: string, values: Record<string, string>) {
  const path = join(dir, ".env.production");
  writeFileSync(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  return path;
}

async function runReadiness(envFile: string, outputBase: string, extraEnv: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["scripts/prod-readiness-check.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROD_READINESS_ENV_FILE: envFile,
      PROD_READINESS_OUTPUT_BASE: outputBase,
      PROD_READINESS_SKIP_COMPOSE: "1",
      PROD_READINESS_LIVE_PROBE: "0",
      PROD_READINESS_ALLOW_HTTP: "0",
      PROD_READINESS_ALLOW_LOOPBACK: "0",
      PROD_READINESS_ALLOW_ISSUES: "0",
      ...extraEnv
    }
  });
  let stdout = "";
  let stderr = "";
  let status: number | null = null;
  let signal: NodeJS.Signals | null = null;
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
    child.on("close", (code, closeSignal) => {
      status = code;
      signal = closeSignal;
      resolve();
    });
  });
  const output = JSON.parse(readFileSync(`${outputBase}.json`, "utf8"));
  return { result: { status, signal, stdout, stderr }, output, markdown: readFileSync(`${outputBase}.md`, "utf8") };
}

async function startProbeServer() {
  const server = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "connection": "close", "content-type": "application/json" }).end("{\"ok\":true}");
      return;
    }
    if (request.url === "/login" || request.url === "/register") {
      response.writeHead(200, { "connection": "close", "content-type": "text/html" }).end("<html><body>ok</body></html>");
      return;
    }
    response.writeHead(404, { "connection": "close" }).end("not found");
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
  return `http://127.0.0.1:${port}`;
}

describe("production readiness script", () => {
  it("passes a production-shaped env file when compose and live probe are skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-readiness-pass-"));
    const envFile = writeEnvFile(dir, baseEnv());

    const { result, output } = await runReadiness(envFile, join(dir, "readiness"));

    expect(result.status).toBe(0);
    expect(output.status).toBe("PASS");
    expect(output.liveProbe).toBe(false);
    expect(output.checks.find((check: { name: string }) => check.name === "APP_URL")?.status).toBe("pass");
    expect(output.checks.find((check: { name: string }) => check.name === "compose config")?.status).toBe("warn");
  });

  it("rejects loopback production URLs unless explicitly allowed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-readiness-loopback-"));
    const envFile = writeEnvFile(dir, baseEnv({
      APP_URL: "https://localhost",
      BETTER_AUTH_URL: "https://localhost"
    }));

    const { result, output } = await runReadiness(envFile, join(dir, "readiness"), {
      PROD_READINESS_ALLOW_ISSUES: "1"
    });

    expect(result.status).toBe(0);
    expect(output.status).toBe("FAIL");
    expect(output.issues).toContain("APP_URL host: must not be loopback in production: localhost");
    expect(output.issues).toContain("BETTER_AUTH_URL host: must not be loopback in production: localhost");
  });

  it("runs live probes against the configured deployment origin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "daily-arxiv-readiness-live-"));
    const origin = await startProbeServer();
    const envFile = writeEnvFile(dir, baseEnv({
      APP_URL: origin,
      BETTER_AUTH_URL: origin
    }));

    const { result, output, markdown } = await runReadiness(envFile, join(dir, "readiness"), {
      PROD_READINESS_LIVE_PROBE: "1",
      PROD_READINESS_ALLOW_HTTP: "1",
      PROD_READINESS_ALLOW_LOOPBACK: "1"
    });

    expect(result.status).toBe(0);
    expect(output.status).toBe("PASS");
    expect(output.liveProbe).toBe(true);
    expect(output.allowLoopback).toBe(true);
    expect(output.checks.find((check: { name: string }) => check.name === "health probe")?.status).toBe("pass");
    expect(output.checks.find((check: { name: string }) => check.name === "login probe")?.status).toBe("pass");
    expect(output.checks.find((check: { name: string }) => check.name === "register probe")?.status).toBe("pass");
    expect(markdown).toContain("Live probe: enabled");
  });
});
