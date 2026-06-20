#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_HEALTH_URL="${DOCKER_SMOKE_APP_HEALTH_URL:-http://localhost:3211/api/health}"
TIMEOUT_SECONDS="${DOCKER_SMOKE_TIMEOUT_SECONDS:-240}"
SERVICES="${DOCKER_SMOKE_SERVICES:-app worker postgres redis}"

echo "==> docker compose config"
docker compose -f "$COMPOSE_FILE" config >/dev/null

echo "==> docker compose up -d --build"
docker compose -f "$COMPOSE_FILE" up -d --build

deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

echo "==> waiting for compose services: $SERVICES"
while [ "$(date +%s)" -le "$deadline" ]; do
  all_ready=1
  for service in $SERVICES; do
    container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null || true)"
    if [ -z "$container_id" ]; then
      all_ready=0
      break
    fi
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{if .State.Running}}running{{else}}{{.State.Status}}{{end}}{{end}}' "$container_id")"
    if [ "$state" != "healthy" ] && [ "$state" != "running" ]; then
      all_ready=0
      break
    fi
  done
  if [ "$all_ready" = "1" ]; then
    echo "compose services ready"
    break
  fi
  sleep 5
done

if [ "$(date +%s)" -gt "$deadline" ]; then
  echo "compose services did not become ready within ${TIMEOUT_SECONDS}s" >&2
  docker compose -f "$COMPOSE_FILE" ps
  docker compose -f "$COMPOSE_FILE" logs --tail=120 app worker
  exit 1
fi

echo "==> waiting for app health: $APP_HEALTH_URL"
while [ "$(date +%s)" -le "$deadline" ]; do
  if node -e "fetch(process.argv[1]).then(async (response) => { const body = await response.json().catch(() => ({})); process.exit(response.ok && body.ok === true ? 0 : 1); }).catch(() => process.exit(1));" "$APP_HEALTH_URL"; then
    echo "app health ok"
    break
  fi
  sleep 5
done

if [ "$(date +%s)" -gt "$deadline" ]; then
  echo "app health did not become ready within ${TIMEOUT_SECONDS}s" >&2
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "==> docker compose ps"
docker compose -f "$COMPOSE_FILE" ps

echo "Docker smoke passed."
