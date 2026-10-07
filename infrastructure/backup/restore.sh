#!/usr/bin/env bash
# Restore a pg_dump custom-format file produced by backup.sh into an
# EXISTING database, replacing its contents (pg_restore --clean
# --if-exists, in one transaction: a failure part-way rolls back and the
# database is left as it was).
#
#   restore.sh <dump-file> <target-database> [--storage <files.tar.gz>] --yes
#
# --storage also unpacks the matching serenemed-<stamp>-storage.tar.gz
# (uploaded patient files) into $STORAGE_DIR, replacing what is there.
# Without --yes it only prints what it would do. Stop everything that
# holds connections to the target first (production: `docker compose
# -f infrastructure/compose/docker-compose.prod.yml stop api`), or the
# DROP statements wait on their locks.
#
# Connection: PGHOST/PGPORT/PGUSER/PGPASSWORD, defaults = local dev stack.
# Must connect as the owner/superuser role ("serenemed"), not the app role.
#
# Local dev example (host port 5433):
#   PGPORT=5433 infrastructure/backup/restore.sh \
#     /tmp/serenemed-backups/daily/serenemed-2026-10-07T120000Z.dump serenemed --yes
# Production (dump lives in the "backups" volume, run inside the sidecar):
#   docker compose -f infrastructure/compose/docker-compose.prod.yml exec db-backup \
#     bash /scripts/restore.sh /backups/daily/<file>.dump serenemed --yes

set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-serenemed}"
export PGPASSWORD="${PGPASSWORD:-serenemed}"

STORAGE_DIR="${STORAGE_DIR:-}"

usage() {
  echo "usage: $0 <dump-file> <target-database> [--storage <files.tar.gz>] --yes" >&2
  exit 2
}

dump=""
target=""
storage_tar=""
confirmed=no
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) confirmed=yes ;;
    --storage) shift; storage_tar="${1:-}"; [ -n "$storage_tar" ] || usage ;;
    -h|--help) usage ;;
    -*) echo "unknown option: $1" >&2; usage ;;
    *)
      if [ -z "$dump" ]; then dump="$1"
      elif [ -z "$target" ]; then target="$1"
      else usage
      fi
      ;;
  esac
  shift
done
[ -n "$dump" ] && [ -n "$target" ] || usage

log() { printf '%s restore: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v pg_restore >/dev/null || die "pg_restore not found on PATH"
command -v psql >/dev/null || die "psql not found on PATH"
[ -f "$dump" ] || die "dump file not found: $dump"
pg_restore --list "$dump" >/dev/null 2>&1 || die "not a readable pg_dump custom-format file: $dump"

exists="$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$target'")"
[ "$exists" = "1" ] || die "database \"$target\" does not exist on $PGHOST:$PGPORT (create it first; this script never creates databases)"

if [ -n "$storage_tar" ]; then
  [ -f "$storage_tar" ] || die "storage archive not found: $storage_tar"
  tar -tzf "$storage_tar" >/dev/null 2>&1 || die "not a readable tar.gz: $storage_tar"
  [ -n "$STORAGE_DIR" ] || die "--storage given but STORAGE_DIR is not set (where the api reads uploaded files from)"
  [ -d "$STORAGE_DIR" ] && [ -w "$STORAGE_DIR" ] || die "STORAGE_DIR=$STORAGE_DIR is not a writable directory (in the db-backup sidecar it is mounted read-only; see the runbook)"
fi

others="$(psql -X -At -d postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$target' AND pid <> pg_backend_pid()")"

echo "This will:"
echo "  1. connect to $PGHOST:$PGPORT as $PGUSER"
echo "  2. DROP every table/view/function in database \"$target\" that the dump defines (--clean --if-exists)"
echo "  3. recreate them from $dump ($(du -h "$dump" | cut -f1)) and load its data"
echo "  4. do all of it in one transaction: on any error, nothing changes"
if [ -n "$storage_tar" ]; then
  echo "  5. delete everything under $STORAGE_DIR and unpack $storage_tar there ($(tar -tzf "$storage_tar" | grep -c -v '/$' | tr -d ' ') files)"
fi
echo "Current data in \"$target\" is replaced. Other connections to it right now: $others"
if [ "$others" != "0" ]; then
  echo "  WARNING: $others other session(s) are connected; DROP will wait for their locks. Stop the api first."
fi

if [ "$confirmed" != "yes" ]; then
  echo
  echo "Dry run only. Re-run with --yes to restore."
  exit 0
fi

log "restoring $dump into $target"
pg_restore --clean --if-exists --single-transaction --no-password \
  --dbname="$target" "$dump"
log "done. Row counts now:"
psql -X -At -d "$target" -c \
  "SELECT 'patients=' || (SELECT count(*) FROM patients) || ' appointments=' || (SELECT count(*) FROM appointments) || ' audit_logs=' || (SELECT count(*) FROM audit_logs)"

if [ -n "$storage_tar" ]; then
  log "replacing uploaded files in $STORAGE_DIR from $storage_tar"
  find "$STORAGE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -xzf "$storage_tar" -C "$STORAGE_DIR"
  log "restored $(find "$STORAGE_DIR" -type f | wc -l | tr -d ' ') files"
fi
