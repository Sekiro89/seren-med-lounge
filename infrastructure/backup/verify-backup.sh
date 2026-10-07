#!/usr/bin/env bash
# Prove the latest backup actually restores: load it into a throwaway
# database "serenemed_verify", count rows in patients / appointments /
# audit_logs, drop the database. Non-zero exit if any step fails.
#
#   verify-backup.sh [dump-file]
#
# With no argument, uses the newest file in $BACKUP_DIR/daily. Needs the
# owner/superuser role (CREATE DATABASE). Connection via
# PGHOST/PGPORT/PGUSER/PGPASSWORD, defaults = local dev stack.
#
# Local dev (host port 5433):
#   PGPORT=5433 BACKUP_DIR=/tmp/serenemed-backups infrastructure/backup/verify-backup.sh
# Production:
#   docker compose -f infrastructure/compose/docker-compose.prod.yml exec db-backup \
#     bash /scripts/verify-backup.sh

set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-serenemed}"
export PGPASSWORD="${PGPASSWORD:-serenemed}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
VERIFY_DB="${VERIFY_DB:-serenemed_verify}"

log() { printf '%s verify: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v pg_restore >/dev/null || die "pg_restore not found on PATH"
command -v psql >/dev/null || die "psql not found on PATH"

dump="${1:-}"
if [ -z "$dump" ]; then
  dump="$(find "$BACKUP_DIR/daily" -maxdepth 1 -type f -name 'serenemed-*.dump' 2>/dev/null | sort -r | head -n 1 || true)"
  [ -n "$dump" ] || die "no dumps in $BACKUP_DIR/daily (run backup.sh first, or pass a file)"
fi
[ -f "$dump" ] || die "dump file not found: $dump"

maint() { psql -X -v ON_ERROR_STOP=1 -At -d postgres "$@"; }

cleanup() {
  maint -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "dump: $dump ($(du -h "$dump" | cut -f1))"
log "creating throwaway database $VERIFY_DB on $PGHOST:$PGPORT"
cleanup
maint -c "CREATE DATABASE \"$VERIFY_DB\"" >/dev/null

log "restoring"
# --exit-on-error: any object that fails to restore fails the whole check.
# Owner/privilege statements are kept so the check also proves the roles
# the dump references exist on this server.
pg_restore --exit-on-error --no-password --dbname="$VERIFY_DB" "$dump"

log "row counts in restored copy:"
status=0
for table in patients appointments audit_logs; do
  if n="$(psql -X -v ON_ERROR_STOP=1 -At -d "$VERIFY_DB" -c "SELECT count(*) FROM \"$table\"" 2>&1)"; then
    log "  $table: $n"
  else
    log "  $table: FAILED ($n)"
    status=1
  fi
done

migrations="$(psql -X -At -d "$VERIFY_DB" -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" 2>/dev/null || echo '?')"
log "  applied migrations recorded: $migrations"

log "dropping $VERIFY_DB"
cleanup
trap - EXIT

# Uploaded-files archive written alongside the dump by backup.sh, if any:
# prove it is a readable tar and say how many files it holds.
storage_tar="${dump%.dump}-storage.tar.gz"
if [ -f "$storage_tar" ]; then
  if files="$(tar -tzf "$storage_tar" | grep -c -v '/$' | tr -d ' ')"; then
    log "storage archive $storage_tar: readable, $files files"
  else
    log "storage archive $storage_tar: UNREADABLE"
    status=1
  fi
else
  log "no storage archive next to the dump (expected $storage_tar); uploaded files were not part of this backup"
fi

if [ "$status" -ne 0 ]; then
  die "verification FAILED for $dump"
fi
log "OK: $dump restores cleanly"
