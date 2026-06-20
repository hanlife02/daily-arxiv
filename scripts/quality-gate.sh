#!/usr/bin/env sh
set -eu

echo "==> typecheck"
pnpm typecheck

echo "==> unit tests"
pnpm test

echo "==> production build"
pnpm build

if [ "${QUALITY_GATE_DOCKER_SMOKE:-0}" = "1" ]; then
  echo "==> docker smoke"
  sh scripts/docker-smoke.sh
else
  echo "==> docker smoke skipped"
  echo "Set QUALITY_GATE_DOCKER_SMOKE=1 or run pnpm smoke:docker when container startup needs to be checked."
fi

echo "Quality gate passed."
