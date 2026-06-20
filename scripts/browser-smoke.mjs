import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright";

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

const env = { ...loadDotEnv(), ...process.env };
const composeFile = env.COMPOSE_FILE ?? "docker-compose.yml";
const appUrl = (env.BROWSER_SMOKE_APP_URL ?? env.DOCKER_BUSINESS_SMOKE_APP_URL ?? env.APP_URL ?? "http://localhost:3211").replace(/\/$/, "");
const seedAdmin = /^(1|true|yes)$/i.test(env.BROWSER_SMOKE_SEED_ADMIN ?? "");
const seededAdminId = `browser-smoke-admin-${randomUUID()}`;
const seededDisabledUserId = `browser-smoke-disabled-${randomUUID()}`;
let adminEmail = env.BROWSER_SMOKE_ADMIN_EMAIL ?? env.DOCKER_BUSINESS_SMOKE_EMAIL ?? env.ADMIN_EMAIL;
let adminPassword = env.BROWSER_SMOKE_ADMIN_PASSWORD ?? env.DOCKER_BUSINESS_SMOKE_PASSWORD ?? env.ADMIN_PASSWORD;
const adminDomain = adminEmail?.split("@")[1] ?? "example.com";
const smokeUserEmail = env.BROWSER_SMOKE_USER_EMAIL ?? env.DOCKER_BUSINESS_SMOKE_USER_EMAIL ?? `docker-smoke-user@${adminDomain}`;
const smokeUserPassword = env.BROWSER_SMOKE_USER_PASSWORD ?? env.DOCKER_BUSINESS_SMOKE_USER_PASSWORD ?? "docker-smoke-password";
const smokePaperId = env.BROWSER_SMOKE_PAPER_ID ?? env.DOCKER_BUSINESS_SMOKE_PAPER_ID ?? "2606.19001";
const smokePaperTitle = "Docker Smoke Test Paper";
const smokePaperCategory = env.BROWSER_SMOKE_PAPER_CATEGORY ?? env.DOCKER_BUSINESS_SMOKE_PAPER_CATEGORY ?? "cs.AI";
const keyboardPaperId = env.BROWSER_SMOKE_KEYBOARD_PAPER_ID ?? "2606.19002";
const keyboardPaperTitle = "Docker Smoke Keyboard Navigation Paper";
const smokeLlmModel = env.BROWSER_SMOKE_LLM_MODEL ?? "browser-smoke-llm";
const smokeLlmApiKey = env.BROWSER_SMOKE_LLM_API_KEY ?? `browser-smoke-${randomUUID()}`;

function fail(message) {
  console.error(message);
  process.exit(1);
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

async function seedBrowserAdminUser() {
  if (!seedAdmin) return undefined;
  const email = `browser-smoke-admin-${randomUUID()}@${adminDomain}`;
  const password = `browser-smoke-${randomUUID()}`;
  const passwordHash = await hashPassword(password);
  console.log("==> seed browser smoke admin user");
  psql(`
    insert into "user" (
      id,
      name,
      email,
      email_verified,
      role,
      disabled,
      notification_disabled,
      created_at,
      updated_at
    ) values (
      ${sqlLiteral(seededAdminId)},
      'Browser Smoke Admin',
      ${sqlLiteral(email)},
      true,
      'admin',
      false,
      false,
      now(),
      now()
    )
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
      ${sqlLiteral(`${seededAdminId}-account`)},
      ${sqlLiteral(seededAdminId)},
      'credential',
      ${sqlLiteral(seededAdminId)},
      ${sqlLiteral(passwordHash)},
      now(),
      now()
    )
  `);
  adminEmail = email;
  adminPassword = password;
  return { userId: seededAdminId };
}

function cleanupBrowserAdminUser(seeded) {
  if (!seeded?.userId) return;
  try {
    psql(`delete from "user" where id = ${sqlLiteral(seeded.userId)}`);
  } catch (error) {
    console.warn(`browser smoke admin cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function seedDisabledBrowserUser() {
  const email = `browser-smoke-disabled-${randomUUID()}@${adminDomain}`;
  const password = `browser-smoke-disabled-${randomUUID()}`;
  const passwordHash = await hashPassword(password);
  console.log("==> seed browser smoke disabled user");
  psql(`
    insert into "user" (
      id,
      name,
      email,
      email_verified,
      role,
      disabled,
      notification_disabled,
      created_at,
      updated_at
    ) values (
      ${sqlLiteral(seededDisabledUserId)},
      'Browser Smoke Disabled User',
      ${sqlLiteral(email)},
      true,
      'user',
      true,
      false,
      now(),
      now()
    )
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
      ${sqlLiteral(`${seededDisabledUserId}-account`)},
      ${sqlLiteral(seededDisabledUserId)},
      'credential',
      ${sqlLiteral(seededDisabledUserId)},
      ${sqlLiteral(passwordHash)},
      now(),
      now()
    )
  `);
  return { userId: seededDisabledUserId, email, password };
}

function cleanupDisabledBrowserUser(seeded) {
  if (!seeded?.userId) return;
  try {
    psql(`delete from "user" where id = ${sqlLiteral(seeded.userId)}`);
  } catch (error) {
    console.warn(`browser smoke disabled user cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function seedKeyboardNavigationPaper() {
  console.log("==> seed browser keyboard navigation paper");
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
      ${sqlLiteral(keyboardPaperId)},
      'v1',
      ${sqlLiteral(keyboardPaperTitle)},
      'A deterministic second fixture paper used by the browser keyboard navigation check.',
      '["Browser Smoke"]'::jsonb,
      ${sqlLiteral(JSON.stringify([smokePaperCategory]))}::jsonb,
      ${sqlLiteral(smokePaperCategory)},
      ${sqlLiteral(`https://arxiv.org/abs/${keyboardPaperId}`)},
      ${sqlLiteral(`https://arxiv.org/pdf/${keyboardPaperId}`)},
      now() - interval '1 minute',
      now() - interval '1 minute',
      now() - interval '1 minute',
      'Keyboard navigation fixture PDF text.'
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
      ${sqlLiteral(keyboardPaperId)},
      1,
      0,
      1,
      1,
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

async function requestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

async function startMockLlmServer() {
  if (env.BROWSER_SMOKE_LLM_BASE_URL) {
    return {
      baseUrl: env.BROWSER_SMOKE_LLM_BASE_URL,
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
    if (lastUserMessage.includes("触发错误")) {
      response.writeHead(429).end("rate limited");
      return;
    }
    const content = lastUserMessage.includes("请总结")
      ? "Browser smoke read summary response."
      : "Browser smoke read chat response.";

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
  console.log(`==> browser smoke mock LLM ${baseUrl}`);
  return {
    baseUrl,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function launchBrowser() {
  const headless = env.BROWSER_SMOKE_HEADED === "1" ? false : true;
  const attempts = [
    ["bundled chromium", () => chromium.launch({ headless })],
    ["Chrome channel", () => chromium.launch({ channel: "chrome", headless })]
  ];

  let lastError;
  for (const [label, launch] of attempts) {
    try {
      console.log(`==> launch ${label}`);
      return await launch();
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error([
    "Unable to launch a Playwright browser.",
    "Run `pnpm exec playwright install chromium` or install Google Chrome, then retry.",
    lastError instanceof Error ? lastError.message : String(lastError)
  ].join("\n"));
}

function attachPageGuards(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`${label} page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      if (message.text() === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
      errors.push(`${label} console error: ${message.text()}`);
    }
  });
  return () => {
    if (errors.length > 0) {
      fail(errors.join("\n"));
    }
  };
}

async function visibleTextLocator(page, text, label) {
  const locator = page.getByText(text, { exact: false });
  const deadline = Date.now() + 15_000;
  let lastCount = 0;
  while (Date.now() < deadline) {
    lastCount = await locator.count().catch(() => 0);
    for (let index = 0; index < lastCount; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
    await page.waitForTimeout(250);
  }
  fail(`${label} did not show visible text ${JSON.stringify(text)}; matched=${lastCount}`);
}

async function expectText(page, text, label) {
  await visibleTextLocator(page, text, label);
  console.log(`ok: ${label}`);
}

async function expectClickableInViewport(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(centerX, centerY);
    const style = window.getComputedStyle(element);
    return {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
      pointerEvents: style.pointerEvents,
      covered: topElement ? !(element === topElement || element.contains(topElement)) : true,
      topElementTag: topElement?.tagName ?? null,
      topElementText: topElement?.textContent?.slice(0, 80) ?? ""
    };
  });
  if (
    result.width <= 0 ||
    result.height <= 0 ||
    result.left < 0 ||
    result.top < 0 ||
    result.right > result.viewportWidth ||
    result.bottom > result.viewportHeight ||
    result.disabled ||
    result.pointerEvents === "none" ||
    result.covered
  ) {
    fail(`${label} is not clickable in viewport: ${JSON.stringify(result)}`);
  }
  console.log(`ok: ${label}`);
}

async function signIn(page, email, password, label) {
  console.log(`==> browser sign-in: ${label}`);
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  const signInResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST",
    { timeout: 15_000 }
  ).catch(() => undefined);
  await page.locator('form button[type="submit"]').click();
  const signInResponse = await signInResponsePromise;
  if (!signInResponse?.ok()) {
    const status = signInResponse ? `HTTP ${signInResponse.status()}` : "no sign-in response";
    const body = signInResponse ? await signInResponse.text().catch(() => "") : "";
    fail(`${label} browser sign-in failed: ${status}${body ? ` ${body.slice(0, 240)}` : ""}`);
  }
  const expectedText = label === "admin" ? "团队仪表板" : "我的仪表板";
  try {
    await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 30_000 });
  } catch (error) {
    const url = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    fail(`${label} dashboard did not show ${expectedText}. URL: ${url}. Body: ${bodyText.slice(0, 500)}`);
  }
  console.log(`ok: ${label} dashboard`);
}

async function saveLlmConfigFromSettings(page, llmBaseUrl) {
  console.log("==> browser save LLM config");
  await page.goto(`${appUrl}/settings`, { waitUntil: "domcontentloaded" });
  await expectText(page, "个人设置", "settings page");
  await page.locator('input[name="baseUrl"]').fill(llmBaseUrl);
  await page.locator('input[name="apiKey"]').fill(smokeLlmApiKey);
  await page.locator('input[name="model"]').fill(smokeLlmModel);
  await Promise.all([
    page.waitForURL(/\/settings\?saved=llm$/, { timeout: 15_000 }),
    page.getByRole("button", { name: "保存模型配置" }).click()
  ]);
}

async function exerciseUserPages(page, llmBaseUrl) {
  await saveLlmConfigFromSettings(page, llmBaseUrl);

  await page.goto(`${appUrl}/papers`, { waitUntil: "domcontentloaded" });
  await expectText(page, smokePaperTitle, "papers fixture");
  await expectClickableInViewport(page.getByRole("button", { name: "筛选" }), "papers filter button");
  await expectClickableInViewport(page.getByRole("link", { name: /阅读/ }).first(), "papers read action");
  const selectAllCheckbox = page.getByLabel("选择当前页全部论文");
  await page.keyboard.press("a");
  if (!(await selectAllCheckbox.isChecked())) {
    fail("papers keyboard select-all did not check the current page selection box");
  }
  await page.keyboard.press("Escape");
  if (await selectAllCheckbox.isChecked()) {
    fail("papers keyboard clear selection did not uncheck the current page selection box");
  }
  console.log("ok: papers keyboard selection shortcuts");
  await page.getByLabel(`选择 ${smokePaperId}`).first().check();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  page.once("dialog", async (dialog) => {
    if (!dialog.message().includes("确认将选中的 1 篇论文标为已读")) {
      fail(`unexpected bulk keyboard action confirmation: ${dialog.message()}`);
    }
    await dialog.accept();
  });
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/papers/state") && response.request().method() === "POST", { timeout: 15_000 }),
    page.keyboard.press("r")
  ]);
  console.log("ok: papers keyboard bulk action");
  await page.goto(`${appUrl}/papers?from=2999-01-01`, { waitUntil: "domcontentloaded" });
  await expectText(page, "暂无论文", "papers empty filtered state");

  await page.goto(`${appUrl}/reports`, { waitUntil: "domcontentloaded" });
  await expectText(page, "日报历史", "reports page");
  const firstReportLink = page.locator('a[href^="/reports/"]').first();
  await firstReportLink.click();
  await expectText(page, "入选论文", "report detail selected papers");
  await expectText(page, smokePaperTitle, "report detail fixture");
  await expectText(page, "在阅读页打开", "report detail read link");
  await page.getByLabel("搜索本日报论文").fill("Smoke");
  await page.keyboard.press("Enter");
  await expectText(page, "匹配", "report detail search result count");
  await expectText(page, "摘要：", "report detail abstract preview");
  await expectText(page, smokePaperTitle, "report detail searched fixture");

  console.log("==> browser read page");
  await page.goto(`${appUrl}/read?paper=${encodeURIComponent(smokePaperId)}`, { waitUntil: "domcontentloaded" });
  await expectText(page, smokePaperTitle, "read fixture");
  await expectText(page, "AI 摘要", "read summary panel");
  await expectText(page, "Browser smoke read summary response.", "read summary stream");
  await page.locator('input[placeholder="输入你的问题..."]').fill("这篇论文的核心贡献是什么？");
  await page.keyboard.press("Enter");
  await expectText(page, "Browser smoke read chat response.", "read chat stream");
  await page.locator('input[placeholder="输入你的问题..."]').fill("请触发错误");
  await page.keyboard.press("Enter");
  await expectText(page, "调整 AI 阅读额度", "read LLM error action hint");
  await page.getByRole("button", { name: "重新填入问题" }).click();
  const retryValue = await page.locator('input[placeholder="输入你的问题..."]').inputValue();
  if (retryValue !== "请触发错误") {
    fail(`read LLM retry did not restore the failed question: ${retryValue}`);
  }
  await page.locator('input[placeholder="输入你的问题..."]').fill("");
  console.log("ok: read LLM error action");

  await page.locator(`[data-paper-id="${smokePaperId}"]`).first().click();
  await page.waitForTimeout(250);
  const readState = await page.evaluate(() => ({
    urlPaper: new URL(window.location.href).searchParams.get("paper"),
    storedPaper: window.localStorage.getItem("daily-arxiv.read.selectedPaperId")
  }));
  if (readState.urlPaper !== smokePaperId) {
    fail(`read paper URL state mismatch: expected ${smokePaperId}, got ${readState.urlPaper ?? "null"}; stored=${readState.storedPaper ?? "null"}`);
  }

  const paperIds = await page.locator("[data-paper-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-paper-id")).filter(Boolean)
  );
  const currentIndex = paperIds.indexOf(smokePaperId);
  const nextPaperId = paperIds[currentIndex + 1];
  if (currentIndex === -1 || !nextPaperId) {
    fail(`read keyboard navigation fixture missing next paper after ${smokePaperId}: ${paperIds.join(", ")}`);
  }
  await page.keyboard.press("j");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("paper") === expected, nextPaperId);
  const nextReadState = await page.evaluate(() => ({
    urlPaper: new URL(window.location.href).searchParams.get("paper"),
    storedPaper: window.localStorage.getItem("daily-arxiv.read.selectedPaperId")
  }));
  if (nextReadState.urlPaper !== nextPaperId || nextReadState.storedPaper !== nextPaperId) {
    fail(`read keyboard next mismatch: expected ${nextPaperId}, got url=${nextReadState.urlPaper ?? "null"} stored=${nextReadState.storedPaper ?? "null"}`);
  }
  await page.keyboard.press("k");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("paper") === expected, smokePaperId);
  const previousReadState = await page.evaluate(() => ({
    urlPaper: new URL(window.location.href).searchParams.get("paper"),
    storedPaper: window.localStorage.getItem("daily-arxiv.read.selectedPaperId")
  }));
  if (previousReadState.urlPaper !== smokePaperId || previousReadState.storedPaper !== smokePaperId) {
    fail(`read keyboard previous mismatch: expected ${smokePaperId}, got url=${previousReadState.urlPaper ?? "null"} stored=${previousReadState.storedPaper ?? "null"}`);
  }
  console.log("ok: read keyboard navigation state");
}

async function exerciseMobileRead(browser) {
  console.log("==> browser mobile read flow");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const page = await context.newPage();
  const assertNoPageErrors = attachPageGuards(page, "mobile");
  await signIn(page, smokeUserEmail, smokeUserPassword, "ordinary user mobile");
  await page.goto(`${appUrl}/papers`, { waitUntil: "domcontentloaded" });
  await expectText(page, smokePaperTitle, "mobile papers fixture");
  await expectClickableInViewport(page.getByRole("link", { name: /阅读/ }).first(), "mobile papers read action");
  await page.goto(`${appUrl}/read?paper=${encodeURIComponent(smokePaperId)}`, { waitUntil: "domcontentloaded" });
  await expectText(page, smokePaperTitle, "mobile read list fixture");
  await (await visibleTextLocator(page, smokePaperTitle, "mobile read list fixture")).click();
  await expectText(page, "AI 摘要", "mobile read summary panel");
  await expectText(page, "Browser smoke read summary response.", "mobile read summary stream");
  await expectClickableInViewport(page.getByRole("button", { name: /已读/ }).first(), "mobile read state button");
  await expectClickableInViewport(page.getByRole("button", { name: /收藏/ }).first(), "mobile favorite button");
  await expectClickableInViewport(page.getByRole("button", { name: /忽略/ }).first(), "mobile ignore button");
  await expectClickableInViewport(page.getByRole("button", { name: /Markdown/ }).first(), "mobile summary markdown button");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/papers/state") && response.request().method() === "POST", { timeout: 15_000 }),
    page.getByRole("button", { name: /收藏/ }).first().click()
  ]);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/papers/state") && response.request().method() === "POST", { timeout: 15_000 }),
    page.getByRole("button", { name: /已读/ }).first().click()
  ]);
  await page.locator('input[placeholder="输入你的问题..."]').fill("移动端可以提问吗？");
  await page.keyboard.press("Enter");
  await expectText(page, "Browser smoke read chat response.", "mobile read chat stream");
  await expectClickableInViewport(page.getByRole("button", { name: /清空/ }).first(), "mobile clear chat button");
  await expectClickableInViewport(page.getByRole("button", { name: /下载会话/ }).first(), "mobile transcript download button");
  await expectClickableInViewport(page.getByRole("button", { name: /复制回答/ }).first(), "mobile copy answer button");
  await page.getByRole("button", { name: /清空/ }).first().click();
  await expectText(page, "向 AI 提问关于这篇论文的任何问题", "mobile chat empty state after clear");
  assertNoPageErrors();
  await context.close();
}

async function exerciseAdminPages(browser, seededAdmin) {
  if (!seededAdmin && (!adminEmail || !adminPassword)) {
    fail("ADMIN_EMAIL and ADMIN_PASSWORD are required for browser smoke admin check.");
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertNoPageErrors = attachPageGuards(page, "admin");
  await signIn(page, adminEmail, adminPassword, "admin");
  await page.goto(`${appUrl}/admin`, { waitUntil: "domcontentloaded" });
  await expectText(page, "管理员后台", "admin page");
  await expectText(page, "日报自动摘要不占用该额度", "admin manual LLM quota scope");
  await expectText(page, "当前事件摘要", "admin operational incident summary");
  await expectText(page, "事件复盘快照", "admin incident history snapshots");
  await expectText(page, "LLM 失败诊断", "admin LLM failure diagnostics");
  assertNoPageErrors();
  await context.close();
}

async function exerciseDisabledUserRedirect(browser, disabledUser) {
  console.log("==> browser disabled user page guard");
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertNoPageErrors = attachPageGuards(page, "disabled user");

  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(disabledUser.email);
  await page.locator('input[name="password"]').fill(disabledUser.password);
  const signInResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/auth/sign-in/email") && response.request().method() === "POST",
    { timeout: 15_000 }
  );
  await page.locator('form button[type="submit"]').click();
  const signInResponse = await signInResponsePromise;
  if (!signInResponse.ok()) {
    const body = await signInResponse.text().catch(() => "");
    fail(`disabled user sign-in did not create a session for page guard check: HTTP ${signInResponse.status()}${body ? ` ${body.slice(0, 240)}` : ""}`);
  }

  await page.goto(`${appUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  const path = new URL(page.url()).pathname;
  if (path !== "/login") {
    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    fail(`disabled user was not redirected to login from dashboard. URL: ${page.url()}. Body: ${bodyText.slice(0, 500)}`);
  }
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 15_000 });
  console.log("ok: disabled user page-level redirect");
  assertNoPageErrors();
  await context.close();
}

if (!seedAdmin && (!adminEmail || !adminPassword)) {
  fail("ADMIN_EMAIL and ADMIN_PASSWORD are required for browser smoke.");
}

const seededAdminUser = await seedBrowserAdminUser();
const seededDisabledUser = await seedDisabledBrowserUser();
seedKeyboardNavigationPaper();
const mockLlm = await startMockLlmServer();
const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const assertNoPageErrors = attachPageGuards(page, "user");
  await signIn(page, smokeUserEmail, smokeUserPassword, "ordinary user");
  await expectText(page, "阅读页摘要/问答，不含日报", "dashboard manual LLM quota scope");
  await exerciseUserPages(page, mockLlm.baseUrl);
  assertNoPageErrors();
  await context.close();

  await exerciseDisabledUserRedirect(browser, seededDisabledUser);
  await exerciseMobileRead(browser);
  await exerciseAdminPages(browser, seededAdminUser);
} finally {
  await browser.close().catch(() => undefined);
  await mockLlm.close();
  cleanupDisabledBrowserUser(seededDisabledUser);
  cleanupBrowserAdminUser(seededAdminUser);
}

console.log("Browser smoke passed.");
