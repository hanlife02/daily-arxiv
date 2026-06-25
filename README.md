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

该命令会依次运行 typecheck、单元测试和生产构建。需要把 Docker 启动也纳入本次门禁时运行：

```bash
pnpm smoke:docker
```

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
