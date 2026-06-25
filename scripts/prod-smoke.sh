#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${PROD_SMOKE_COMPOSE_FILE:-docker-compose.prod.yml}"
PROJECT_NAME="${PROD_SMOKE_PROJECT_NAME:-daily-arxiv-prod-smoke}"
APP_PORT="${PROD_SMOKE_APP_PORT:-3212}"
TIMEOUT_SECONDS="${PROD_SMOKE_TIMEOUT_SECONDS:-240}"
DATA_DIR="${PROD_SMOKE_DATA_DIR:-}"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env is required for production smoke. Copy .env.example to .env and fill required secrets first." >&2
  exit 1
fi

if [ -z "$DATA_DIR" ]; then
  DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/daily-arxiv-prod-smoke-data.XXXXXX")"
fi

mkdir -p "$DATA_DIR/app" "$DATA_DIR/backups" "$DATA_DIR/postgres" "$DATA_DIR/redis"

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
export APP_PORT
export APP_URL="http://localhost:$APP_PORT"
export BETTER_AUTH_URL="$APP_URL"
export DATA_DIR

CONFIG_JSON="/tmp/daily-arxiv-prod-compose-config.json"

echo "==> production compose config"
docker compose -f "$COMPOSE_FILE" config --format json > "$CONFIG_JSON"

node - "$CONFIG_JSON" <<'NODE'
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const services = config.services ?? {};

for (const serviceName of ["postgres", "redis"]) {
  const ports = services[serviceName]?.ports ?? [];
  if (ports.length > 0) {
    console.error(`production ${serviceName} must not publish ports`);
    process.exit(1);
  }
}

const appPorts = services.app?.ports ?? [];
if (appPorts.length !== 1) {
  console.error("production app must publish exactly one HTTP port");
  process.exit(1);
}

console.log("production compose exposure ok");
NODE

echo "==> production smoke data dir: $DATA_DIR"
COMPOSE_FILE="$COMPOSE_FILE" \
DOCKER_SMOKE_APP_HEALTH_URL="$APP_URL/api/health" \
DOCKER_SMOKE_TIMEOUT_SECONDS="$TIMEOUT_SECONDS" \
sh scripts/docker-smoke.sh

echo "Production smoke passed."
echo "production smoke data kept for inspection: $DATA_DIR"
