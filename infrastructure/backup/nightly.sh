#!/usr/bin/env bash
# Entrypoint of the db-backup sidecar (docker-compose.prod.yml). A
# cron-like loop with no cron: sleep until BACKUP_AT (hh:mm, in TZ),
# run backup.sh, repeat. Everything is logged to stdout so `docker
# compose logs db-backup` is the audit trail. A failed backup is logged
# and retried the next night; the loop itself never exits.
#
# BACKUP_NOW=1 runs one backup immediately on start (useful right after
# first deploy to confirm the whole path works) before entering the loop.

set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
BACKUP_AT="${BACKUP_AT:-02:00}"
hh="${BACKUP_AT%%:*}"
mm="${BACKUP_AT##*:}"
# strip leading zeros so "08" is not read as octal
hh=$((10#$hh))
mm=$((10#$mm))

log() { printf '%s nightly: %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)" "$*"; }

if [ -n "${BACKUP_S3_URL:-}" ] && ! command -v aws >/dev/null; then
  log "BACKUP_S3_URL set, installing aws-cli"
  apk add --no-cache aws-cli >/dev/null || log "WARNING: aws-cli install failed; uploads will fail until it is available"
fi

log "schedule: daily at $(printf '%02d:%02d' "$hh" "$mm") $(date +%Z) (TZ=${TZ:-unset}); dumps -> ${BACKUP_DIR:-./backups}"

run_backup() {
  if bash "$here/backup.sh"; then
    log "backup succeeded"
  else
    log "backup FAILED (exit $?) — will retry at the next scheduled time"
  fi
}

if [ "${BACKUP_NOW:-0}" = "1" ]; then
  run_backup
fi

while true; do
  now=$(date +%s)
  # seconds since local midnight, from the local clock fields (portable:
  # no `date -d` parsing, which busybox/BSD date disagree on)
  since_midnight=$(( 10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S) ))
  target=$(( now - since_midnight + hh * 3600 + mm * 60 ))
  if [ "$target" -le "$now" ]; then
    target=$(( target + 86400 ))
  fi
  wait=$(( target - now ))
  log "next backup in ${wait}s"
  sleep "$wait"
  run_backup
done
