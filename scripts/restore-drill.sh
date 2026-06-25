#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_SERVICE="${RESTORE_DRILL_POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${RESTORE_DRILL_POSTGRES_USER:-daily_arxiv}"
SOURCE_DB="${RESTORE_DRILL_SOURCE_DB:-daily_arxiv}"
DRILL_DB="${RESTORE_DRILL_DB:-daily_arxiv_restore_drill}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(find ./data/backups -maxdepth 1 -type f -name 'daily-arxiv-*.sql' -print | sort | tail -1)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "backup file not found. Pass a SQL backup path or create one in ./data/backups." >&2
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  echo "backup file is empty: $BACKUP_FILE" >&2
  exit 1
fi

echo "==> restore drill backup: $BACKUP_FILE"
echo "==> compose postgres service: $POSTGRES_SERVICE"
echo "==> drill database: $DRILL_DB"

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" pg_isready -U "$POSTGRES_USER" -d "$SOURCE_DB" >/dev/null

echo "==> recreate drill database"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" createdb -U "$POSTGRES_USER" "$DRILL_DB"

echo "==> restore SQL into drill database"
sed '/^SET transaction_timeout = /d' "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 >/tmp/daily-arxiv-restore-drill-restore.log

echo "==> validate restored tables"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "
select 'users=' || count(*) from \"user\";
select 'papers=' || count(*) from paper;
select 'reports=' || count(*) from report;
select 'job_logs=' || count(*) from job_log;
select 'settings=' || count(*) from admin_setting;
" | tee /tmp/daily-arxiv-restore-drill-counts.txt

echo "==> validate restored business data"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A <<'SQL' | tee /tmp/daily-arxiv-restore-drill-business.txt
select 'users_with_preferences=' || count(distinct user_id) from user_preference;
select 'users_with_llm_config=' || count(distinct user_id) from user_llm_config;
select 'reports_with_latest_version=' || count(distinct r.id)
from report r
join report_version rv on rv.report_id = r.id and rv.version = r.latest_version;
select 'report_versions_with_selected_papers=' || count(*)
from report_version
where jsonb_array_length(selected_paper_ids) > 0;
select 'selected_paper_refs_missing=' || count(*)
from report_version rv
cross join lateral jsonb_array_elements_text(rv.selected_paper_ids) selected_paper_id
left join paper p on p.arxiv_id = selected_paper_id
where p.arxiv_id is null;
select 'user_paper_states=' || count(*) from user_paper_state;
select 'user_paper_states_favorited=' || count(*) from user_paper_state where favorited = true;
select 'user_paper_states_read=' || count(*) from user_paper_state where read = true;
select 'user_paper_states_ignored=' || count(*) from user_paper_state where ignored = true;

do $$
begin
  if exists (
    select 1
    from report r
    where not exists (
      select 1
      from report_version rv
      where rv.report_id = r.id
        and rv.version = r.latest_version
    )
  ) then
    raise exception 'restored report is missing its latest report_version';
  end if;

  if exists (
    select 1
    from report_version
    where jsonb_typeof(selected_paper_ids) <> 'array'
  ) then
    raise exception 'restored report_version selected_paper_ids is not an array';
  end if;

  if exists (
    select 1
    from report_version rv
    cross join lateral jsonb_array_elements_text(rv.selected_paper_ids) selected_paper_id
    left join paper p on p.arxiv_id = selected_paper_id
    where p.arxiv_id is null
  ) then
    raise exception 'restored report_version references a missing paper';
  end if;

  if exists (
    select 1
    from user_llm_config
    where base_url = ''
       or encrypted_api_key = ''
       or model = ''
  ) then
    raise exception 'restored user_llm_config contains empty required fields';
  end if;
end $$;
SQL

if [ "${RESTORE_DRILL_DROP_AFTER:-0}" = "1" ]; then
  echo "==> drop drill database"
  docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" dropdb -U "$POSTGRES_USER" --if-exists "$DRILL_DB"
else
  echo "restore drill database kept for inspection: $DRILL_DB"
fi

echo "Restore drill passed."
