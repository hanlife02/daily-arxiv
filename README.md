# daily-arxiv

自托管多用户 arXiv 日报服务。第一版按 Obsidian 规划实现基础产品骨架、核心业务模块、数据库模型、Docker 部署和核心逻辑测试。

## 快速开始

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:push
pnpm dev
```

访问 `http://localhost:3000`。

## 服务

- `app`：Next.js Web/API，暴露 `3000`。
- `worker`：BullMQ 任务处理器，不暴露端口。
- `postgres`：仅 Docker 内部访问，数据在 `./data/postgres`。
- `redis`：仅 Docker 内部访问，数据在 `./data/redis`。

生产环境请在反向代理层配置 HTTPS，并把 `APP_URL` / `BETTER_AUTH_URL` 设置为最终 HTTPS 地址。

## 数据迁移

用户可以在“个人设置”下载个人 JSON，并在新实例中导入该 JSON。导入只恢复个人偏好，以及当前实例中已存在论文的收藏、已读、忽略状态；导入前可选择偏好、阅读状态两个 section，预览导入会显示可导入内容、会变化的偏好字段、覆盖/新增阅读状态、已有阅读状态实际变化数量和跳过数量，真正写入需要勾选确认。导入不会恢复日报正文、账号凭据、API Key、SMTP 密码或加密密文。完整迁移和灾难恢复仍应使用数据库备份、`.env` 和原 `FIELD_ENCRYPTION_KEY`。

管理员可以在后台导出系统设置 JSON，并在新实例中导入系统设置、注册邮箱后缀，以及按邮箱匹配已有用户的通知状态和 AI 阅读额度覆盖。导入前可选择系统设置、注册后缀、已有用户状态三个 section；预览导入会显示会变化的系统设置字段、注册后缀覆盖/新增、已有后缀实际变化数量、已有用户更新、已有用户状态实际变化数量和跳过数量，不会写入数据库；真正写入需要勾选确认。管理员导入不会恢复通知 SMTP 密码、不会创建用户，也不会修改用户角色、禁用状态或账号凭据。

## 校验

```bash
pnpm quality
```

该命令会依次运行 typecheck、单元测试和生产构建；单元测试已覆盖 PDF 缓存/下载/解析失败、超长文本截断，以及 LLM 流式上游错误、非标准片段和日志回调失败隔离。需要把 Docker 启动也纳入本次门禁时运行：

```bash
pnpm smoke:docker
```

需要验证管理员登录、管理员健康 API 和 worker 备份队列时运行：

```bash
pnpm smoke:docker:business
```

需要额外验证真实 arXiv 上游抓取时运行：

```bash
pnpm smoke:docker:business:live-arxiv
```

该命令会在业务 smoke 基础上调用真实 `/api/papers/crawl`，依赖 `export.arxiv.org` 网络可用性，因此不放进默认门禁。

需要验证注册邮件、邮箱验证链接和 Better Auth 回调链路时运行：

```bash
pnpm smoke:auth-email
```

该命令会启动一个本地 SMTP 捕获服务器，临时用 compose override 重启 app 指向该 SMTP，插入测试注册域名，调用真实 `/api/auth/sign-up/email` 注册临时用户，捕获验证邮件，访问邮件中的验证链接，确认数据库 `email_verified=true`，再用该用户登录并检查 session cookie；结束后会删除临时用户并恢复 app 容器到基础 compose 配置。该命令也会生成 `data/ops/auth-email-smoke-YYYY-MM-DD.{md,json}`，报告会标记为本地 capture 证据，用于证明注册验证代码链路，不等同于真实 SMTP 投递。

需要验证真实 Auth SMTP 能接收注册/验证邮件投递时运行：

```bash
AUTH_SMTP_DELIVERY_TO=ops@example.com AUTH_SMTP_DELIVERY_EVIDENCE_LEVEL=production pnpm prod:auth-smtp
```

该命令会使用 `.env` 中的 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASSWORD` 和 `SMTP_FROM` 发送一封测试邮件，默认生成 `data/ops/auth-smtp-delivery-YYYY-MM-DD.{md,json}`。生产证据审计要求该报告为 `evidenceLevel=production`，SMTP host 不能是 localhost/127.0.0.1，并且至少有一个 accepted recipient。

需要验证真实浏览器页面流程时运行：

```bash
pnpm smoke:docker:browser
```

该命令会先运行业务 smoke 准备 Docker 服务和 fixture 数据，再用 Playwright 登录普通用户、保存 LLM 配置、访问仪表板/设置/论文池/日报历史/日报详情/阅读页，验证论文池批量确认、论文池键盘全选/清空/批量已读、移动端论文池卡片、论文池空筛选状态、日报详情入选论文、搜索结果、摘要预览与阅读页跳转、阅读页 `paper` URL 状态保持、阅读页键盘上下篇导航、桌面和移动端阅读页的 mock LLM 摘要/问答流式内容、LLM 错误后的下一步提示、移动端关键控件可见且未被遮挡、收藏/已读写入、复制/下载/清空控件和清空后的问答空状态，并用临时管理员账号访问管理员后台、当前事件摘要、事件复盘快照和 LLM 失败诊断区。

需要用生产 compose 做临时独立数据目录演练时运行：

```bash
pnpm smoke:prod
```

该命令会检查 `docker-compose.prod.yml` 中 PostgreSQL 和 Redis 未发布端口，使用 `PROD_SMOKE_APP_PORT`（默认 3212）和临时 `DATA_DIR` 启动 app/worker/postgres/redis，并检查生产 app health。

需要在真实部署前检查 `.env`、HTTPS 地址、Better Auth 回调地址和生产 compose 暴露面时运行：

```bash
pnpm prod:readiness
```

该命令会生成 Markdown/JSON 报告，默认写入 `data/ops/prod-readiness-YYYY-MM-DD.{md,json}`；检查项包括 `APP_URL` / `BETTER_AUTH_URL` 是否为同一 HTTPS origin、生产 URL 是否不是 localhost/127.0.0.1、生产密钥和管理员密码是否仍是占位值、SMTP 是否可用于注册验证邮件、备份保留天数、成本价格 JSON，以及 PostgreSQL/Redis 是否没有发布宿主机端口。真实域名已经接好反向代理后，可用 `PROD_READINESS_LIVE_PROBE=1 pnpm prod:readiness` 额外探测 `/api/health`、`/login` 和 `/register`。

需要验证最新 SQL 备份能恢复到独立演练数据库时运行：

```bash
pnpm restore:drill
```

该命令会把最新 SQL 备份恢复到 Docker PostgreSQL 的独立演练库，校验关键表可读，并检查日报 latest version、日报入选论文引用、用户 LLM 配置必填字段和用户论文状态等业务数据完整性。

需要进一步验证恢复库能启动应用、登录并读取恢复数据时运行：

```bash
pnpm restore:app-smoke
```

该命令会先执行 `restore:drill`，再启动一个临时 app 容器连接恢复库，用恢复出来的 smoke 用户登录，并检查设置页、日报列表、日报详情、阅读页和用户导出 JSON；结束后会移除临时 app 容器。
该命令也会生成 `data/ops/restore-app-smoke-YYYY-MM-DD.{md,json}`，默认标记为本地恢复证据。用于生产恢复验收时，需要在目标环境运行并设置 `RESTORE_APP_SMOKE_EVIDENCE_LEVEL=production`。

7 天试运行期间需要生成每日运维快照时运行：

```bash
pnpm ops:daily-check
```

该命令会从 Docker PostgreSQL 和本地备份目录生成 Markdown/JSON 日检报告，默认写入 `data/ops/daily-check-YYYY-MM-DD.{md,json}`，覆盖数据库体积、heartbeat、抓取/日报/邮件/备份/清理任务、LLM 调用、队列健康和备份文件。生产 7 天试运行期间需要设置 `OPS_DAILY_CHECK_EVIDENCE_LEVEL=production`。

7 天日检报告收齐后运行：

```bash
pnpm ops:trial-summary
```

该命令会读取 `data/ops/daily-check-*.{json,md}`，检查连续 7 天证据是否齐全，并汇总 heartbeat、任务失败、队列积压、备份和 LLM 失败；同一天同时存在 JSON 和 Markdown 时优先读取 JSON。输出默认写入 `data/ops/trial-summary-YYYY-MM-DD.{md,json}`；只有 7 份日检都标记为 `production` 时，汇总才会成为生产证据。缺少日期或存在验收问题时会失败。

需要采集供应商/PDF 故障样本时运行：

```bash
pnpm ops:failure-samples
```

该命令会生成 Markdown/JSON 样本，包含真实 PDF 失败探测、最近任务/LLM/邮件失败日志；配置 `OPS_FAILURE_SAMPLE_LLM_BASE_URL` 后还会对 OpenAI-compatible endpoint 采集脱敏 LLM 失败响应。用于生产证据审计时，需要设置 `OPS_FAILURE_SAMPLE_EVIDENCE_LEVEL=production`，且 LLM endpoint 不能是 localhost/127.0.0.1。

需要把供应商 usage/billing 导出和本地 LLM 日志估算做对账时运行：

```bash
OPS_LLM_BILLING_EXPORT=provider-usage.csv pnpm ops:llm-billing-reconcile
```

该命令会读取供应商 CSV/JSON 导出，连接 Docker PostgreSQL 汇总 `llm_call_log`，并生成 Markdown/JSON 对账报告。报告会按日期和模型比较供应商 token/成本、本地实测或估算 token/成本和差异；本地日志会优先使用 OpenAI-compatible `usage` 返回的 prompt/completion/total tokens，缺失时才按字符数估算。可用 `OPS_LLM_BILLING_RATES_JSON` 或 `LLM_COST_RATES_JSON` 配置本地成本估算价格。用于生产证据审计时，需要设置 `OPS_LLM_BILLING_EVIDENCE_LEVEL=production`，本地 fixture 默认不会被当作生产账单证据。

需要审计生产验收证据是否齐全时运行：

```bash
pnpm prod:evidence-audit
```

该命令会检查 `data/ops` 中的注册验证本地 capture smoke、Auth SMTP 生产投递、生产就绪 live probe、7 天试运行汇总、PDF/LLM 失败样本、LLM 账单对账、本地恢复 app smoke 和生产恢复 app smoke artifact，并生成 `data/ops/prod-evidence-audit-YYYY-MM-DD.{md,json}`。7 天试运行汇总必须是结构化 JSON 且 `evidenceLevel=production`。审计默认只接受 14 天内的 artifact，可用 `PROD_EVIDENCE_MAX_AGE_DAYS` 调整；FAIL/MISSING 项会在报告里输出 `nextAction`，提示对应的补证命令或目标环境要求。缺少真实生产证据时会失败；如果只是想生成当前缺口报告，可设置 `PROD_EVIDENCE_ALLOW_INCOMPLETE=1`。

或：

```bash
QUALITY_GATE_DOCKER_SMOKE=1 pnpm quality
```

单独运行基础检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```
