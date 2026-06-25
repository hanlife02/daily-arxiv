import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_STALE_MS = 120_000;
const DEFAULT_SCHEDULER_HEARTBEAT_STALE_MS = 15 * 60 * 1000;

export type WorkerHeartbeat = {
  service: "daily-arxiv-worker";
  pid: number;
  startedAt: string;
  updatedAt: string;
  schedulerEnabled: boolean;
};

export type WorkerHeartbeatStatus = {
  ok: boolean;
  message: string;
  path: string;
  ageMs?: number;
  heartbeat?: WorkerHeartbeat;
};

export type SchedulerTickSummary = {
  crawlQueued: boolean;
  reportsQueued: number;
  backupQueued: boolean;
  retentionQueued: boolean;
};

export type SchedulerHeartbeat = {
  service: "daily-arxiv-scheduler";
  pid: number;
  status: "succeeded" | "failed" | "disabled";
  updatedAt: string;
  lastStartedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  durationMs?: number;
  summary?: SchedulerTickSummary;
  error?: string;
};

export type SchedulerHeartbeatStatus = {
  ok: boolean;
  message: string;
  path: string;
  ageMs?: number;
  heartbeat?: SchedulerHeartbeat;
};

function numberFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function workerHeartbeatPath() {
  return process.env.WORKER_HEARTBEAT_PATH ?? join("data", "app", "worker-heartbeat.json");
}

export function schedulerHeartbeatPath() {
  return process.env.SCHEDULER_HEARTBEAT_PATH ?? join("data", "app", "scheduler-heartbeat.json");
}

export function workerHeartbeatIntervalMs() {
  return numberFromEnv("WORKER_HEARTBEAT_INTERVAL_MS", DEFAULT_HEARTBEAT_INTERVAL_MS);
}

export function workerHeartbeatStaleMs() {
  return numberFromEnv("WORKER_HEARTBEAT_STALE_MS", DEFAULT_HEARTBEAT_STALE_MS);
}

export function schedulerHeartbeatStaleMs() {
  return numberFromEnv("SCHEDULER_HEARTBEAT_STALE_MS", DEFAULT_SCHEDULER_HEARTBEAT_STALE_MS);
}

export function writeWorkerHeartbeat(startedAt: Date, now = new Date()) {
  const path = workerHeartbeatPath();
  mkdirSync(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
  const heartbeat: WorkerHeartbeat = {
    service: "daily-arxiv-worker",
    pid: process.pid,
    startedAt: startedAt.toISOString(),
    updatedAt: now.toISOString(),
    schedulerEnabled: process.env.WORKER_SCHEDULER_DISABLED !== "true"
  };
  writeFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(heartbeat, null, 2)}\n`, "utf8");
  return heartbeat;
}

export function readWorkerHeartbeat(now = new Date(), staleMs = workerHeartbeatStaleMs()): WorkerHeartbeatStatus {
  const path = workerHeartbeatPath();
  if (!existsSync(/*turbopackIgnore: true*/ path)) {
    return { ok: false, message: "worker heartbeat missing", path };
  }

  try {
    const heartbeat = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")) as WorkerHeartbeat;
    const updatedAt = new Date(heartbeat.updatedAt);
    const ageMs = now.getTime() - updatedAt.getTime();
    if (!Number.isFinite(ageMs)) {
      return { ok: false, message: "worker heartbeat timestamp invalid", path, heartbeat };
    }
    if (ageMs > staleMs) {
      return { ok: false, message: `worker heartbeat stale (${Math.round(ageMs / 1000)}s old)`, path, ageMs, heartbeat };
    }
    return { ok: true, message: `updated ${Math.round(ageMs / 1000)}s ago`, path, ageMs, heartbeat };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "worker heartbeat unreadable",
      path
    };
  }
}

export function writeSchedulerHeartbeat(heartbeat: SchedulerHeartbeat) {
  const path = schedulerHeartbeatPath();
  mkdirSync(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(heartbeat, null, 2)}\n`, "utf8");
  return heartbeat;
}

export function readSchedulerHeartbeat(now = new Date(), staleMs = schedulerHeartbeatStaleMs()): SchedulerHeartbeatStatus {
  const path = schedulerHeartbeatPath();
  if (process.env.WORKER_SCHEDULER_DISABLED === "true") {
    return { ok: true, message: "scheduler disabled", path };
  }
  if (!existsSync(/*turbopackIgnore: true*/ path)) {
    return { ok: false, message: "scheduler heartbeat missing", path };
  }

  try {
    const heartbeat = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")) as SchedulerHeartbeat;
    if (heartbeat.status === "disabled") {
      return { ok: true, message: "scheduler disabled", path, heartbeat };
    }
    if (heartbeat.status === "failed") {
      return {
        ok: false,
        message: `scheduler failed${heartbeat.consecutiveFailures > 1 ? ` ${heartbeat.consecutiveFailures} times` : ""}: ${heartbeat.error ?? "unknown error"}`,
        path,
        heartbeat
      };
    }

    const updatedAt = new Date(heartbeat.updatedAt);
    const ageMs = now.getTime() - updatedAt.getTime();
    if (!Number.isFinite(ageMs)) {
      return { ok: false, message: "scheduler heartbeat timestamp invalid", path, heartbeat };
    }
    if (ageMs > staleMs) {
      return { ok: false, message: `scheduler heartbeat stale (${Math.round(ageMs / 1000)}s old)`, path, ageMs, heartbeat };
    }
    return { ok: true, message: `last tick ${Math.round(ageMs / 1000)}s ago`, path, ageMs, heartbeat };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "scheduler heartbeat unreadable",
      path
    };
  }
}

export function startWorkerHeartbeat() {
  const startedAt = new Date();
  const write = () => {
    try {
      writeWorkerHeartbeat(startedAt);
    } catch (error) {
      console.error("daily-arxiv worker heartbeat failed", error);
    }
  };

  write();
  const interval = setInterval(write, workerHeartbeatIntervalMs());
  return () => clearInterval(interval);
}
