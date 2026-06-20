import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const envFile = process.env.PROD_READINESS_ENV_FILE ?? ".env";
const composeFile = process.env.PROD_READINESS_COMPOSE_FILE ?? "docker-compose.prod.yml";
const skipCompose = /^(1|true|yes)$/i.test(process.env.PROD_READINESS_SKIP_COMPOSE ?? "");
const liveProbe = /^(1|true|yes)$/i.test(process.env.PROD_READINESS_LIVE_PROBE ?? "");
const allowHttp = /^(1|true|yes)$/i.test(process.env.PROD_READINESS_ALLOW_HTTP ?? "");
const allowLoopback = /^(1|true|yes)$/i.test(process.env.PROD_READINESS_ALLOW_LOOPBACK ?? "");
const allowIssues = /^(1|true|yes)$/i.test(process.env.PROD_READINESS_ALLOW_ISSUES ?? "");
const generatedAt = new Date();
const day = formatDateInTimeZone(generatedAt, "Asia/Shanghai");
const outputBase = process.env.PROD_READINESS_OUTPUT_BASE ?? join("data", "ops", `prod-readiness-${day}`);
const issues = [];
const warnings = [];
const checks = [];

function formatDateInTimeZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCheck(name, status, detail = "") {
  checks.push({ name, status, detail });
  if (status === "fail") issues.push(`${name}: ${detail}`);
  if (status === "warn") warnings.push(`${name}: ${detail}`);
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    addCheck("env file", "fail", `not found: ${path}`);
    return {};
  }
  const env = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  addCheck("env file", "pass", path);
  return env;
}

function looksPlaceholder(value) {
  return /^(|change-me|admin@example\.com|replace-|your-|example|password|secret)$/i.test(value)
    || /replace|change|example|placeholder/i.test(value);
}

function requireValue(env, key) {
  const value = env[key]?.trim() ?? "";
  if (!value) {
    addCheck(key, "fail", "missing");
    return "";
  }
  if (looksPlaceholder(value)) {
    addCheck(key, "fail", "still looks like a placeholder");
  } else {
    addCheck(key, "pass", "present");
  }
  return value;
}

function validUrl(value) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized.endsWith(".localhost")
    || /^127\./.test(normalized);
}

function checkUrl(name, value) {
  const url = validUrl(value);
  if (!url) {
    addCheck(name, "fail", `invalid URL: ${value || "(empty)"}`);
    return undefined;
  }
  if (url.protocol !== "https:" && !allowHttp) {
    addCheck(name, "fail", `must be https in production: ${value}`);
  } else if (url.protocol !== "https:") {
    addCheck(name, "warn", `HTTP allowed by PROD_READINESS_ALLOW_HTTP: ${value}`);
  } else {
    addCheck(name, "pass", url.origin);
  }
  if (isLoopbackHost(url.hostname) && !allowLoopback) {
    addCheck(`${name} host`, "fail", `must not be loopback in production: ${url.hostname}`);
  } else if (isLoopbackHost(url.hostname)) {
    addCheck(`${name} host`, "warn", `loopback allowed by PROD_READINESS_ALLOW_LOOPBACK: ${url.hostname}`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    addCheck(`${name} origin`, "warn", "should normally be only the deployment origin without path/query/hash");
  }
  return url;
}

function checkSecret(env, key, minLength) {
  const value = requireValue(env, key);
  if (!value || looksPlaceholder(value)) return;
  if (value.length < minLength) {
    addCheck(`${key} length`, "fail", `expected at least ${minLength} characters`);
  } else {
    addCheck(`${key} length`, "pass", `${value.length} characters`);
  }
}

function checkEmail(value) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    addCheck("ADMIN_EMAIL format", "fail", "invalid email");
  } else {
    addCheck("ADMIN_EMAIL format", "pass", value.replace(/^[^@]+/, "***"));
  }
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function checkEnv(env) {
  const appUrl = checkUrl("APP_URL", requireValue(env, "APP_URL"));
  const authUrl = checkUrl("BETTER_AUTH_URL", requireValue(env, "BETTER_AUTH_URL"));
  if (appUrl && authUrl) {
    if (appUrl.origin !== authUrl.origin) {
      addCheck("APP_URL/BETTER_AUTH_URL origin", "fail", `${appUrl.origin} != ${authUrl.origin}`);
    } else {
      addCheck("APP_URL/BETTER_AUTH_URL origin", "pass", appUrl.origin);
    }
  }

  checkSecret(env, "BETTER_AUTH_SECRET", 32);
  checkSecret(env, "FIELD_ENCRYPTION_KEY", 32);

  const adminEmail = requireValue(env, "ADMIN_EMAIL");
  if (adminEmail) checkEmail(adminEmail);
  const adminPassword = requireValue(env, "ADMIN_PASSWORD");
  if (adminPassword && !looksPlaceholder(adminPassword)) {
    if (adminPassword.length < 12) addCheck("ADMIN_PASSWORD length", "fail", "expected at least 12 characters");
    else addCheck("ADMIN_PASSWORD length", "pass", `${adminPassword.length} characters`);
  }

  requireValue(env, "SMTP_HOST");
  requireValue(env, "SMTP_FROM");
  const smtpPort = positiveInteger(env.SMTP_PORT ?? "587");
  if (!smtpPort) addCheck("SMTP_PORT", "fail", "must be a positive integer");
  else addCheck("SMTP_PORT", "pass", String(smtpPort));
  const smtpSecure = /^(1|true|yes)$/i.test(env.SMTP_SECURE ?? "false");
  if (smtpSecure && smtpPort !== 465) addCheck("SMTP_SECURE/SMTP_PORT", "warn", "SMTPS is usually port 465");
  if (!smtpSecure && smtpPort === 465) addCheck("SMTP_SECURE/SMTP_PORT", "warn", "port 465 usually needs SMTP_SECURE=true");

  const retention = positiveInteger(env.BACKUP_RETENTION_DAYS ?? "7");
  if (!retention) addCheck("BACKUP_RETENTION_DAYS", "fail", "must be a positive integer");
  else addCheck("BACKUP_RETENTION_DAYS", "pass", `${retention} days`);

  const dataDir = env.DATA_DIR?.trim();
  if (dataDir === "/" || dataDir === "/tmp") {
    addCheck("DATA_DIR", "fail", "must not point at a root or transient system directory");
  } else if (dataDir) {
    addCheck("DATA_DIR", "pass", dataDir);
  } else {
    addCheck("DATA_DIR", "warn", "not set; compose will default to ./data");
  }

  if (!env.LLM_COST_RATES_JSON?.trim()) {
    addCheck("LLM_COST_RATES_JSON", "warn", "missing; admin cost view will show zero cost for unpriced models");
  } else {
    try {
      JSON.parse(env.LLM_COST_RATES_JSON);
      addCheck("LLM_COST_RATES_JSON", "pass", "valid JSON");
    } catch {
      addCheck("LLM_COST_RATES_JSON", "fail", "invalid JSON");
    }
  }

  return { appUrl };
}

function checkCompose() {
  if (skipCompose) {
    addCheck("compose config", "warn", "skipped by PROD_READINESS_SKIP_COMPOSE");
    return;
  }
  if (!existsSync(composeFile)) {
    addCheck("compose file", "fail", `not found: ${composeFile}`);
    return;
  }
  try {
    const output = execFileSync(
      "docker",
      ["compose", "--env-file", envFile, "-f", composeFile, "config", "--format", "json"],
      { encoding: "utf8" }
    );
    const config = JSON.parse(output);
    const services = config.services ?? {};
    for (const serviceName of ["postgres", "redis"]) {
      const ports = services[serviceName]?.ports ?? [];
      if (ports.length > 0) addCheck(`compose ${serviceName} ports`, "fail", "must not publish host ports");
      else addCheck(`compose ${serviceName} ports`, "pass", "not published");
    }
    const appPorts = services.app?.ports ?? [];
    if (appPorts.length !== 1) addCheck("compose app ports", "fail", "app should publish exactly one HTTP port");
    else addCheck("compose app ports", "pass", JSON.stringify(appPorts[0]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck("compose config", "fail", message.split("\n")[0]);
  }
}

async function probeUrl(label, url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow" });
    const elapsed = Date.now() - startedAt;
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" && !allowHttp) {
      addCheck(`${label} final protocol`, "fail", `redirected to non-HTTPS ${response.url}`);
    }
    if (!response.ok) {
      addCheck(`${label} probe`, "fail", `${response.status} ${response.statusText}`);
    } else {
      addCheck(`${label} probe`, "pass", `${response.status} in ${elapsed}ms`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck(`${label} probe`, "fail", message);
  }
}

async function checkLive(appUrl) {
  if (!liveProbe) {
    addCheck("live probe", "warn", "skipped; set PROD_READINESS_LIVE_PROBE=1 to check the target deployment");
    return;
  }
  if (!appUrl) {
    addCheck("live probe", "fail", "APP_URL is invalid");
    return;
  }
  const origin = appUrl.origin;
  await probeUrl("health", `${origin}/api/health`);
  await probeUrl("login", `${origin}/login`);
  await probeUrl("register", `${origin}/register`);
}

function mdEscape(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function table(headers, rows) {
  if (rows.length === 0) return "_No rows._\n";
  return [
    `| ${headers.map(mdEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`)
  ].join("\n") + "\n";
}

function writeReport() {
  const status = issues.length === 0 ? "PASS" : "FAIL";
  const jsonOutput = {
    generatedAt: generatedAt.toISOString(),
    status,
    envFile,
    composeFile,
    liveProbe,
    allowLoopback,
    checks,
    issues,
    warnings
  };
  const markdown = [
    `# daily-arxiv Production Readiness ${day}`,
    "",
    `Status: ${status}`,
    `Generated at: ${generatedAt.toISOString()}`,
    `Env file: ${envFile}`,
    `Compose file: ${composeFile}`,
    `Live probe: ${liveProbe ? "enabled" : "disabled"}`,
    "",
    "## Checks",
    table(["check", "status", "detail"], checks.map((check) => [check.name, check.status, check.detail])),
    "## Issues",
    issues.length > 0 ? issues.map((issue) => `- ${issue}`).join("\n") + "\n" : "_No issues._\n",
    "## Warnings",
    warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join("\n") + "\n" : "_No warnings._\n"
  ].join("\n");

  mkdirSync(dirname(outputBase), { recursive: true });
  writeFileSync(`${outputBase}.json`, `${JSON.stringify(jsonOutput, null, 2)}\n`);
  writeFileSync(`${outputBase}.md`, markdown);
  console.log(`Production readiness report written: ${outputBase}.md`);
  console.log(`Production readiness JSON written: ${outputBase}.json`);
  return status;
}

const env = parseEnvFile(envFile);
const { appUrl } = checkEnv(env);
checkCompose();
await checkLive(appUrl);
const status = writeReport();

if (status !== "PASS" && !allowIssues) {
  process.exit(1);
}
