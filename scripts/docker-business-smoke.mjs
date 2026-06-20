import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { hashPassword } from "better-auth/crypto";

const composeFile = process.env.COMPOSE_FILE ?? "docker-compose.yml";
const timeoutSeconds = Number(process.env.DOCKER_BUSINESS_SMOKE_TIMEOUT_SECONDS ?? 180);

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = parseEnvValue(trimmed.slice(index + 1));
  }
  return values;
}

const dotEnv = loadDotEnv();
const env = { ...dotEnv, ...process.env };
const appUrl = (env.DOCKER_BUSINESS_SMOKE_APP_URL ?? env.APP_URL ?? "http://localhost:3211").replace(/\/$/, "");
const adminEmail = env.DOCKER_BUSINESS_SMOKE_EMAIL ?? env.ADMIN_EMAIL;
const adminPassword = env.DOCKER_BUSINESS_SMOKE_PASSWORD ?? env.ADMIN_PASSWORD;
const adminDomain = adminEmail?.split("@")[1] ?? "example.com";
const smokeUserId = env.DOCKER_BUSINESS_SMOKE_USER_ID ?? "docker-smoke-user";
const smokeUserEmail = env.DOCKER_BUSINESS_SMOKE_USER_EMAIL ?? `docker-smoke-user@${adminDomain}`;
const smokeUserPassword = env.DOCKER_BUSINESS_SMOKE_USER_PASSWORD ?? `docker-smoke-${randomUUID()}`;
const smokePaperId = env.DOCKER_BUSINESS_SMOKE_PAPER_ID ?? "2606.19001";
const smokePaperTitle = "Docker Smoke Test Paper";
const smokePaperCategory = "cs.AI";
const smokeLlmModel = env.DOCKER_BUSINESS_SMOKE_LLM_MODEL ?? "docker-smoke-llm";
const smokeLlmApiKey = env.DOCKER_BUSINESS_SMOKE_LLM_API_KEY ?? "docker-smoke-key";
const liveArxivEnabled = /^(1|true|yes)$/i.test(env.DOCKER_BUSINESS_SMOKE_LIVE_ARXIV ?? "");

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function readText(response) {
  return response.text().catch(() => "");
}

async function expectOk(response, label) {
  if (response.ok) return response;
  const body = await readText(response);
  fail(`${label} failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeaderFrom(setCookies) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["compose", "-f", composeFile, "exec", "-T", "postgres", "psql", "-U", "daily_arxiv", "-d", "daily_arxiv", "-t", "-A", "-c", sql],
    { encoding: "utf8" }
  ).trim();
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

async function startMockLlmServer() {
  if (env.DOCKER_BUSINESS_SMOKE_LLM_BASE_URL) {
    return {
      baseUrl: env.DOCKER_BUSINESS_SMOKE_LLM_BASE_URL,
      close: async () => {}
    };
  }

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end("not found");
      return;
    }

    if (request.headers.authorization !== `Bearer ${smokeLlmApiKey}`) {
      response.writeHead(401).end("unauthorized");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(await requestBody(request));
    } catch {
      response.writeHead(400).end("invalid json");
      return;
    }

    if (parsed?.model !== smokeLlmModel || parsed?.stream !== true || !Array.isArray(parsed?.messages)) {
      response.writeHead(400).end("invalid chat completion request");
      return;
    }

    const lastUserMessage = [...parsed.messages].reverse().find((message) => message?.role === "user")?.content ?? "";
    const content = lastUserMessage.includes("请总结")
      ? "Docker smoke read summary response."
      : "Docker smoke read chat response.";

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content }, index: 0 }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });

  const baseUrl = `http://host.docker.internal:${port}`;
  console.log(`==> mock LLM server ${baseUrl}`);
  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function waitForBackupJob(jobId) {
  return waitForJobStatus("backup", jobId);
}

async function waitForReportJob(jobId) {
  return waitForJobStatus("report-generation", jobId);
}

async function waitForJobStatus(type, jobId) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const sql = `
    select status
    from job_log
    where type = ${sqlLiteral(type)}
      and metadata->>'jobId' = ${sqlLiteral(jobId)}
    order by created_at desc
    limit 1
  `;

  while (Date.now() <= deadline) {
    const status = psql(sql);
    if (status === "succeeded") return status;
    if (status === "failed") fail(`${type} queue job ${jobId} failed`);
    await sleep(3000);
  }

  fail(`${type} queue job ${jobId} did not complete within ${timeoutSeconds}s`);
}

async function signIn(email, password, label) {
  console.log(`==> ${label} sign-in`);
  const signInResponse = await expectOk(await fetch(`${appUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: appUrl
    },
    body: new URLSearchParams({ email, password }),
    redirect: "manual"
  }), `${label} sign-in`);

  const sessionCookies = getSetCookies(signInResponse);
  const cookieHeader = cookieHeaderFrom(sessionCookies);
  if (!cookieHeader.includes("better-auth.session_token=")) {
    fail(`${label} sign-in did not return a Better Auth session cookie`);
  }
  return cookieHeader;
}

async function expectPage(cookieHeader, path, expectedText, label) {
  console.log(`==> ${label}`);
  const response = await expectOk(await fetch(`${appUrl}${path}`, {
    headers: { cookie: cookieHeader },
    redirect: "manual"
  }), label);
  const html = await response.text();
  if (!html.includes(expectedText)) fail(`${label} did not contain expected text: ${expectedText}`);
  return html;
}

async function seedSmokeUser() {
  console.log("==> seed ordinary smoke user");
  const passwordHash = await hashPassword(smokeUserPassword);
  psql(`
    insert into "user" (
      id,
      name,
      email,
      email_verified,
      role,
      disabled,
      notification_disabled,
      manual_llm_calls_per_user_per_day_override,
      concurrent_manual_llm_calls_per_user_override,
      created_at,
      updated_at
    ) values (
      ${sqlLiteral(smokeUserId)},
      'Docker Smoke User',
      ${sqlLiteral(smokeUserEmail)},
      true,
      'user',
      false,
      false,
      1000,
      2,
      now(),
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      email = excluded.email,
      email_verified = true,
      role = 'user',
      disabled = false,
      notification_disabled = false,
      manual_llm_calls_per_user_per_day_override = 1000,
      concurrent_manual_llm_calls_per_user_override = 2,
      updated_at = now()
  `);
  psql(`
    insert into account (
      id,
      account_id,
      provider_id,
      user_id,
      password,
      created_at,
      updated_at
    ) values (
      ${sqlLiteral(`${smokeUserId}-account`)},
      ${sqlLiteral(smokeUserId)},
      'credential',
      ${sqlLiteral(smokeUserId)},
      ${sqlLiteral(passwordHash)},
      now(),
      now()
    )
    on conflict (id) do update set
      account_id = excluded.account_id,
      provider_id = excluded.provider_id,
      user_id = excluded.user_id,
      password = excluded.password,
      updated_at = now()
  `);
  psql(`
    insert into user_preference (
      user_id,
      categories,
      include_keywords,
      exclude_keywords,
      category_weights,
      top_n,
      send_time,
      timezone,
      summary_focus,
      created_at,
      updated_at
    ) values (
      ${sqlLiteral(smokeUserId)},
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb,
      5,
      '09:00',
      'Asia/Shanghai',
      '',
      now(),
      now()
    )
    on conflict (user_id) do update set
      categories = excluded.categories,
      include_keywords = excluded.include_keywords,
      exclude_keywords = excluded.exclude_keywords,
      category_weights = excluded.category_weights,
      top_n = excluded.top_n,
      send_time = excluded.send_time,
      timezone = excluded.timezone,
      summary_focus = excluded.summary_focus,
      updated_at = now()
  `);
}

function seedSmokePaper() {
  console.log("==> seed smoke paper");
  psql(`
    insert into paper (
      arxiv_id,
      latest_version,
      title,
      abstract,
      authors,
      categories,
      primary_category,
      arxiv_url,
      pdf_url,
      published_at,
      updated_at,
      first_seen_at,
      pdf_text
    ) values (
      ${sqlLiteral(smokePaperId)},
      'v1',
      ${sqlLiteral(smokePaperTitle)},
      'A deterministic fixture paper used by the Docker business smoke check.',
      '["Docker Smoke"]'::jsonb,
      ${sqlLiteral(JSON.stringify([smokePaperCategory]))}::jsonb,
      ${sqlLiteral(smokePaperCategory)},
      ${sqlLiteral(`https://arxiv.org/abs/${smokePaperId}`)},
      ${sqlLiteral(`https://arxiv.org/pdf/${smokePaperId}`)},
      now(),
      now(),
      now(),
      'Smoke fixture PDF text.'
    )
    on conflict (arxiv_id) do update set
      latest_version = excluded.latest_version,
      title = excluded.title,
      abstract = excluded.abstract,
      authors = excluded.authors,
      categories = excluded.categories,
      primary_category = excluded.primary_category,
      arxiv_url = excluded.arxiv_url,
      pdf_url = excluded.pdf_url,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at,
      first_seen_at = excluded.first_seen_at,
      pdf_text = excluded.pdf_text
  `);
  psql(`
    insert into paper_metric (
      arxiv_id,
      avg_h_index,
      strong_author_count,
      peak_h_index,
      references_count,
      s2_status,
      error,
      fetched_at
    ) values (
      ${sqlLiteral(smokePaperId)},
      10,
      0,
      10,
      5,
      'ok',
      null,
      now()
    )
    on conflict (arxiv_id) do update set
      avg_h_index = excluded.avg_h_index,
      strong_author_count = excluded.strong_author_count,
      peak_h_index = excluded.peak_h_index,
      references_count = excluded.references_count,
      s2_status = excluded.s2_status,
      error = excluded.error,
      fetched_at = excluded.fetched_at
  `);
}

async function saveSmokeUserPreference(cookieHeader) {
  console.log("==> save ordinary user smoke preference");
  const response = await fetch(`${appUrl}/api/settings/preferences`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader,
      origin: appUrl
    },
    body: new URLSearchParams({
      categories: smokePaperCategory,
      [`categoryWeight:${smokePaperCategory}`]: "1",
      includeKeywords: "",
      excludeKeywords: "",
      topN: "5",
      sendTime: "09:00",
      timezone: "Asia/Shanghai",
      summaryFocus: ""
    }),
    redirect: "manual"
  });
  if (response.status !== 303) {
    const body = await readText(response);
    fail(`ordinary user preference save failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
  }
}

async function updatePaperState(cookieHeader) {
  console.log("==> update ordinary user paper state");
  const response = await expectOk(await fetch(`${appUrl}/api/papers/state`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      origin: appUrl
    },
    body: JSON.stringify({
      paperId: smokePaperId,
      favorited: true,
      read: true,
      ignored: false
    })
  }), "ordinary user paper state update");
  const body = await response.json().catch(() => null);
  const state = body?.states?.[0];
  if (body?.ok !== true || state?.favorited !== true || state?.read !== true || state?.ignored !== false) {
    fail("ordinary user paper state update did not persist expected state");
  }
}

function resetSmokeLlmRunningCalls() {
  psql(`
    update llm_call_log
    set status = 'failed',
        error = 'reset by docker business smoke',
        finished_at = now()
    where user_id = ${sqlLiteral(smokeUserId)}
      and status = 'started'
      and endpoint in ('read-summary', 'read-chat')
  `);
}

function llmSuccessCount(endpoint, requireMeasuredTokens = false) {
  return Number(psql(`
    select count(*)::int
    from llm_call_log
    where user_id = ${sqlLiteral(smokeUserId)}
      and paper_id = ${sqlLiteral(smokePaperId)}
      and endpoint = ${sqlLiteral(endpoint)}
      and model = ${sqlLiteral(smokeLlmModel)}
      and status = 'succeeded'
      and used_pdf_text = true
      ${requireMeasuredTokens ? "and total_tokens is not null" : ""}
  `));
}

async function saveSmokeUserLlmConfig(cookieHeader, baseUrl) {
  console.log("==> save ordinary user mock LLM config");
  const response = await fetch(`${appUrl}/api/settings/llm`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader,
      origin: appUrl
    },
    body: new URLSearchParams({
      baseUrl,
      apiKey: smokeLlmApiKey,
      model: smokeLlmModel
    }),
    redirect: "manual"
  });
  if (response.status !== 303) {
    const body = await readText(response);
    fail(`ordinary user LLM config save failed: HTTP ${response.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
  }
}

async function expectStreamContains(response, label, expectedText) {
  const streamResponse = await expectOk(response, label);
  const text = await streamResponse.text();
  if (!text.includes(expectedText)) {
    fail(`${label} stream did not contain expected text: ${expectedText}`);
  }
  return text;
}

async function exerciseReadLlmInteractions(cookieHeader, llmBaseUrl) {
  await saveSmokeUserLlmConfig(cookieHeader, llmBaseUrl);
  resetSmokeLlmRunningCalls();

  const requireMeasuredTokens = !env.DOCKER_BUSINESS_SMOKE_LLM_BASE_URL;
  const summaryBefore = llmSuccessCount("read-summary", requireMeasuredTokens);
  console.log("==> read summary API with mock LLM");
  await expectStreamContains(await fetch(`${appUrl}/api/read/summary`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      origin: appUrl
    },
    body: JSON.stringify({ paperId: smokePaperId })
  }), "read summary API", "Docker smoke read summary response.");
  if (llmSuccessCount("read-summary", requireMeasuredTokens) <= summaryBefore) {
    fail("read summary API did not write a succeeded llm_call_log row");
  }

  const chatBefore = llmSuccessCount("read-chat", requireMeasuredTokens);
  console.log("==> read chat API with mock LLM");
  await expectStreamContains(await fetch(`${appUrl}/api/read/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
      origin: appUrl
    },
    body: JSON.stringify({
      paperId: smokePaperId,
      messages: [{ role: "user", content: "这篇论文的核心贡献是什么？" }]
    })
  }), "read chat API", "Docker smoke read chat response.");
  if (llmSuccessCount("read-chat", requireMeasuredTokens) <= chatBefore) {
    fail("read chat API did not write a succeeded llm_call_log row");
  }
}

async function exerciseLiveArxivCrawl(cookieHeader) {
  if (!liveArxivEnabled) return;

  console.log("==> live arXiv crawl through user API");
  const beforeCount = Number(psql("select count(*)::int from paper"));
  const response = await expectOk(await fetch(`${appUrl}/api/papers/crawl`, {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      origin: appUrl
    }
  }), "live arXiv crawl API");
  const body = await response.json().catch(() => null);
  const stat = body?.stats?.find((item) => item?.category === smokePaperCategory);
  if (body?.ok !== true || !Array.isArray(body?.categories) || !body.categories.includes(smokePaperCategory) || !stat) {
    fail("live arXiv crawl API did not return expected category stats");
  }
  if (!Number.isFinite(stat.fetched) || stat.fetched <= 0) {
    fail(`live arXiv crawl API returned no fetched entries for ${smokePaperCategory}`);
  }
  const afterCount = Number(psql("select count(*)::int from paper"));
  if (afterCount < beforeCount) {
    fail("live arXiv crawl unexpectedly reduced paper count");
  }
  console.log(`live arXiv crawl fetched ${stat.fetched} entries for ${smokePaperCategory}`);
}

if (!adminEmail || !adminPassword) {
  fail("ADMIN_EMAIL and ADMIN_PASSWORD are required for docker business smoke.");
}

console.log(`==> public health ${appUrl}/api/health`);
const publicHealth = await expectOk(await fetch(`${appUrl}/api/health`), "public health");
const publicHealthBody = await publicHealth.json().catch(() => null);
if (publicHealthBody?.ok !== true) fail("public health did not return ok: true");

console.log("==> login page");
const loginPage = await expectOk(await fetch(`${appUrl}/login`), "login page");
const loginHtml = await loginPage.text();
if (!loginHtml.includes("登录")) fail("login page did not contain expected text");

const adminCookieHeader = await signIn(adminEmail, adminPassword, "admin");

await expectPage(adminCookieHeader, "/admin", "管理员后台", "admin page");

console.log("==> admin health API");
const adminHealth = await expectOk(await fetch(`${appUrl}/api/admin/health`, {
  headers: { cookie: adminCookieHeader }
}), "admin health API");
const adminHealthBody = await adminHealth.json().catch(() => null);
if (!adminHealthBody?.checks?.postgres || !adminHealthBody?.checks?.redis) {
  fail("admin health API did not include postgres and redis checks");
}

console.log("==> enqueue backup job through admin API");
const backupResponse = await fetch(`${appUrl}/api/admin/backup`, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: adminCookieHeader,
    origin: appUrl
  },
  body: "",
  redirect: "manual"
});
if (backupResponse.status !== 303) {
  const body = await readText(backupResponse);
  fail(`backup enqueue failed: HTTP ${backupResponse.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
}

const location = backupResponse.headers.get("location") ?? "";
const jobId = new URL(location, appUrl).searchParams.get("job");
if (!jobId) fail(`backup enqueue did not return a job id: ${location}`);
console.log(`backup job queued: ${jobId}`);

console.log("==> waiting for worker to complete backup job");
await waitForBackupJob(jobId);

await seedSmokeUser();
const userCookieHeader = await signIn(smokeUserEmail, smokeUserPassword, "ordinary user");
seedSmokePaper();
await saveSmokeUserPreference(userCookieHeader);
await expectPage(userCookieHeader, "/dashboard", "我的仪表板", "user dashboard page");
await expectPage(userCookieHeader, "/settings", "个人设置", "user settings page");
await expectPage(userCookieHeader, "/papers", smokePaperTitle, "user papers page");
await expectPage(userCookieHeader, "/reports", "日报历史", "user reports page");
await expectPage(userCookieHeader, `/read?paper=${encodeURIComponent(smokePaperId)}`, smokePaperTitle, "user read page");
await updatePaperState(userCookieHeader);
await exerciseLiveArxivCrawl(userCookieHeader);
const mockLlm = await startMockLlmServer();
try {
  await exerciseReadLlmInteractions(userCookieHeader, mockLlm.baseUrl);
} finally {
  await mockLlm.close();
}

console.log("==> ordinary user forbidden from admin health API");
const forbiddenAdminHealth = await fetch(`${appUrl}/api/admin/health`, {
  headers: { cookie: userCookieHeader },
  redirect: "manual"
});
if (forbiddenAdminHealth.status !== 403) {
  fail(`ordinary user admin health check expected 403, got HTTP ${forbiddenAdminHealth.status}`);
}

console.log("==> enqueue ordinary user report job");
const reportResponse = await fetch(`${appUrl}/api/reports/generate`, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: userCookieHeader,
    origin: appUrl
  },
  body: new URLSearchParams({ batchDate: new Date().toISOString().slice(0, 10) }),
  redirect: "manual"
});
if (reportResponse.status !== 303) {
  const body = await readText(reportResponse);
  fail(`ordinary user report enqueue failed: HTTP ${reportResponse.status}${body ? ` ${body.slice(0, 240)}` : ""}`);
}
const reportLocation = reportResponse.headers.get("location") ?? "";
const reportJobId = new URL(reportLocation, appUrl).searchParams.get("job");
if (!reportJobId) fail(`ordinary user report enqueue did not return a job id: ${reportLocation}`);
console.log(`report job queued: ${reportJobId}`);
console.log("==> waiting for worker to complete ordinary user report job");
await waitForReportJob(reportJobId);

console.log("Docker business smoke passed.");
