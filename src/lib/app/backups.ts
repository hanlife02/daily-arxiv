import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { getAdminSettings } from "@/lib/app/settings";

export type BackupResult = {
  sqlPath: string;
  envPath?: string;
  sizeBytes: number;
};

export type BackupFile = {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: Date;
};

function backupDir() {
  return join(process.cwd(), "data", "backups");
}

function retentionDays(override?: number) {
  if (override) return Math.max(1, Math.floor(override));
  const parsed = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 7;
}

function timestamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function pruneOldBackups(dir: string, now = new Date(), retentionDaysOverride?: number) {
  const cutoff = now.getTime() - retentionDays(retentionDaysOverride) * 24 * 60 * 60 * 1000;
  for (const file of readdirSync(dir)) {
    if (!file.startsWith("daily-arxiv-")) continue;
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.mtime.getTime() < cutoff) {
      unlinkSync(fullPath);
    }
  }
}

export async function createDatabaseBackup(now = new Date()): Promise<BackupResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const settings = await getAdminSettings();

  const dir = backupDir();
  mkdirSync(dir, { recursive: true });

  const stamp = timestamp(now);
  const sqlPath = join(dir, `daily-arxiv-${stamp}.sql`);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(sqlPath);
    const child = spawn("pg_dump", [databaseUrl], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      output.close();
      if (code === 0) resolve();
      else reject(new Error(stderr || `pg_dump exited with code ${code}`));
    });
  });

  let envPath: string | undefined;
  if (existsSync(".env")) {
    envPath = join(dir, `daily-arxiv-${stamp}.env`);
    copyFileSync(".env", envPath);
  }

  pruneOldBackups(dir, now, settings.backupRetentionDays);

  return {
    sqlPath,
    envPath,
    sizeBytes: statSync(sqlPath).size
  };
}

export function listBackupFiles(limit = 10): BackupFile[] {
  const dir = backupDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.startsWith("daily-arxiv-"))
    .map((file) => {
      const path = join(dir, file);
      const stat = statSync(path);
      return {
        name: basename(file),
        path,
        sizeBytes: stat.size,
        createdAt: stat.mtime
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}
