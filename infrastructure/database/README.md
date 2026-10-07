# infrastructure/database/

Reserved for one-off database maintenance scripts and staging seed data
that don't belong in `apps/api/prisma/` (schema + migrations only).

Backup, restore and verification scripts live in `../backup/`
(`backup.sh`, `restore.sh`, `verify-backup.sh`, and `nightly.sh` for the
compose sidecar). The role split (`01-app-role.sql`) is in
`../docker/postgres-init/`.
