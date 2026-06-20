#!/usr/bin/env sh
set -eu

usage() {
  cat >&2 <<'EOF'
usage: scripts/restore-db.sh [--dry-run] [--yes] ./data/backups/daily-arxiv-YYYYMMDDTHHMMSSZ.sql

Restores a plain SQL backup into DATABASE_URL.

Options:
  --dry-run  Check DATABASE_URL, psql, and the backup file without restoring.
  --yes      Skip interactive confirmation. For automation, RESTORE_CONFIRM=I_UNDERSTAND also works.

Important:
  Restore into a clean database when possible.
  Keep the original .env and FIELD_ENCRYPTION_KEY, otherwise encrypted LLM and SMTP secrets cannot be decrypted.
EOF
}

DRY_RUN=0
ASSUME_YES=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "backup file is empty: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH" >&2
  exit 1
fi

ENV_SNAPSHOT="${BACKUP_FILE%.sql}.env"
if [ -f "$ENV_SNAPSHOT" ]; then
  echo "found matching env snapshot: $ENV_SNAPSHOT"
else
  echo "warning: no matching .env snapshot found next to SQL backup" >&2
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry run ok: $BACKUP_FILE can be restored with current DATABASE_URL"
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ] && [ "${RESTORE_CONFIRM:-}" != "I_UNDERSTAND" ]; then
  echo "refusing to restore without confirmation." >&2
  echo "Re-run with --yes or RESTORE_CONFIRM=I_UNDERSTAND after verifying DATABASE_URL points at the intended database." >&2
  exit 1
fi

sed '/^SET transaction_timeout = /d' "$BACKUP_FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
echo "restore completed: $BACKUP_FILE"
