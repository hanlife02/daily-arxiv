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

## 校验

```bash
pnpm typecheck
pnpm test
```
