FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgres://daily_arxiv:daily_arxiv@postgres:5432/daily_arxiv \
  REDIS_URL=redis://redis:6379 \
  BETTER_AUTH_SECRET=build-time-placeholder-secret-32-bytes \
  BETTER_AUTH_URL=http://localhost:3000 \
  FIELD_ENCRYPTION_KEY=build-time-placeholder-field-key \
  pnpm build

FROM base AS runner
ENV NODE_ENV=production
RUN apk add --no-cache postgresql-client
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
