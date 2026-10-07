#!/usr/bin/env bash
# Dump the SereneMed database (pg_dump custom format), prune old dumps,
# optionally copy the new one to S3. Exit code is non-zero on any failure
# so a scheduler/monitor can tell.
#
# Layout under BACKUP_DIR:
#   daily/serenemed-<UTC timestamp>.dump   newest KEEP_DAILY kept (default 14)
#   weekly/serenemed-<UTC timestamp>.dump  a copy of the Sunday dump; newest
#                                          KEEP_WEEKLY kept (default 8)
#   daily|weekly/serenemed-<same timestamp>-storage.tar.gz
#                                          uploaded patient files from
#                                          STORAGE_DIR, same retention.
#                                          Skipped (with a log line) when
#                                          STORAGE_DIR is unset or absent.
#
# Connection comes from the standard libpq variables (PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE). Defaults match the local dev stack
# (root docker-compose.yml). In production the db-backup sidecar in
# infrastructure/compose/docker-compose.prod.yml sets them.
#
# Local dev (Postgres published on host port 5433 — check `docker port
# serenemed-postgres`; the compose default is 5432):
#   PGPORT=5433 BACKUP_DIR=/tmp/serenemed-backups infrastructure/backup/backup.sh
# or, with no Postgres client installed, inside the dev container:
#   docker exec -e BACKUP_DIR=/tmp/backups serenemed-postgres \
#     bash -s < infrastructure/backup/backup.sh
#
# Optional: BACKUP_S3_URL=s3://bucket/prefix uploads the dump with the
# aws CLI (must be installed; AWS_* env vars or an instance role
# provide credentials). Missing CLI with BACKUP_S3_URL set is a failure,
# not a silent skip.

set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-serenemed}"
export PGPASSWORD="${PGPASSWORD:-serenemed}"
export PGDATABASE="${PGDATABASE:-serenemed}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
# ISO day-of-week number for the weekly copy: 7 = Sunday.
WEEKLY_DAY="${WEEKLY_DAY:-7}"
BACKUP_S3_URL="${BACKUP_S3_URL:-}"
STORAGE_DIR="${STORAGE_DIR:-}"

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v pg_dump >/dev/null || die "pg_dump not found on PATH"
command -v pg_restore >/dev/null || die "pg_restore not found on PATH"
if [ -n "$BACKUP_S3_URL" ] && ! command -v aws >/dev/null; then
  die "BACKUP_S3_URL is set but the aws CLI is not installed"
fi

daily_dir="$BACKUP_DIR/daily"
weekly_dir="$BACKUP_DIR/weekly"
mkdir -p "$daily_dir" "$weekly_dir"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
target="$daily_dir/serenemed-$stamp.dump"
storage_target="$daily_dir/serenemed-$stamp-storage.tar.gz"
tmp="$target.partial"
storage_tmp="$storage_target.partial"
trap 'rm -f "$tmp" "$storage_tmp"' EXIT

log "dumping $PGDATABASE@$PGHOST:$PGPORT as $PGUSER -> $target"
pg_dump --format=custom --compress=6 --no-password --file="$tmp" "$PGDATABASE"
# A dump that pg_restore cannot even list is not a backup.
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$target"
size="$(du -h "$target" | cut -f1)"
log "wrote $target ($size)"

# Uploaded patient files (api STORAGE_DIR). Taken right after the dump so
# the two are as close to one point in time as a file tree allows.
written=("$target")
if [ -n "$STORAGE_DIR" ] && [ -d "$STORAGE_DIR" ]; then
  log "archiving $STORAGE_DIR -> $storage_target"
  tar -czf "$storage_tmp" -C "$STORAGE_DIR" .
  tar -tzf "$storage_tmp" >/dev/null
  mv "$storage_tmp" "$storage_target"
  log "wrote $storage_target ($(du -h "$storage_target" | cut -f1), $(tar -tzf "$storage_target" | grep -c -v '/$' | tr -d ' ') files)"
  written+=("$storage_target")
elif [ -n "$STORAGE_DIR" ]; then
  log "WARNING: STORAGE_DIR=$STORAGE_DIR does not exist; no files archived"
else
  log "STORAGE_DIR unset; uploaded files not archived"
fi

if [ "$(date +%u)" = "$WEEKLY_DAY" ]; then
  for f in "${written[@]}"; do
    cp "$f" "$weekly_dir/"
    log "weekly copy -> $weekly_dir/$(basename "$f")"
  done
fi

# Prune by count, newest first (timestamps in the name sort lexically),
# never by age — if the scheduler stalls for a month, nothing is deleted.
# Dumps and storage tars are pruned as separate series with the same N.
prune() {
  local dir="$1" keep="$2" pattern="$3" n=0 f
  while IFS= read -r f; do
    n=$((n + 1))
    if [ "$n" -gt "$keep" ]; then
      rm -f "$f"
      log "pruned $f"
    fi
  done < <(find "$dir" -maxdepth 1 -type f -name "$pattern" | sort -r)
}
prune "$daily_dir" "$KEEP_DAILY" 'serenemed-*.dump'
prune "$daily_dir" "$KEEP_DAILY" 'serenemed-*-storage.tar.gz'
prune "$weekly_dir" "$KEEP_WEEKLY" 'serenemed-*.dump'
prune "$weekly_dir" "$KEEP_WEEKLY" 'serenemed-*-storage.tar.gz'

if [ -n "$BACKUP_S3_URL" ]; then
  for f in "${written[@]}"; do
    log "uploading $(basename "$f") to $BACKUP_S3_URL/"
    aws s3 cp --only-show-errors "$f" "$BACKUP_S3_URL/$(basename "$f")"
  done
  log "uploaded"
fi

log "done: $(find "$daily_dir" -maxdepth 1 -name '*.dump' | wc -l | tr -d ' ') daily, $(find "$weekly_dir" -maxdepth 1 -name '*.dump' | wc -l | tr -d ' ') weekly dumps kept in $BACKUP_DIR"
