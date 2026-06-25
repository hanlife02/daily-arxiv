#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/daily-arxiv-$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

pg_dump "$DATABASE_URL" > "$TARGET"

if [ -f .env ]; then
  cp .env "$BACKUP_DIR/daily-arxiv-$TIMESTAMP.env"
fi

find "$BACKUP_DIR" -name 'daily-arxiv-*' -mtime +"$RETENTION_DAYS" -type f -delete
echo "$TARGET"
