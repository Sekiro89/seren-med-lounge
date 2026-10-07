# Runbook — running SereneMed on a VPS with Docker

How to deploy, update, roll back, restore and rotate secrets for the
production compose stack in `infrastructure/compose/`. Background and
the reasoning behind each piece: `docs/architecture/deployment.md`.

What runs (`infrastructure/compose/docker-compose.prod.yml`):

| service       | image                                   | role                                                   |
| ------------- | --------------------------------------- | ------------------------------------------------------ |
| `caddy`       | `caddy:2-alpine`                        | HTTPS (Let's Encrypt), routes the three hostnames      |
| `api`         | `ghcr.io/<owner>/serenemed-api`         | NestJS API on :4000 (private)                          |
| `staff-web`   | `ghcr.io/<owner>/serenemed-staff-web`   | staff app on :3001 (private)                           |
| `patient-web` | `ghcr.io/<owner>/serenemed-patient-web` | patient app on :3000 (private)                         |
| `postgres`    | `postgres:16-alpine`                    | database, volume `postgres-data`                       |
| `redis`       | `redis:7-alpine`                        | sessions/rate limits, append-only, volume `redis-data` |
| `db-backup`   | `postgres:16-alpine`                    | nightly `pg_dump` + uploaded-files tar to `backups`    |

Hostnames: `api.<DOMAIN>`, `staff.<DOMAIN>`, `app.<DOMAIN>`. Only Caddy
publishes ports (80/443). Uploaded patient files live in the
`serenemed-storage` volume, mounted into `api` at `/data/storage`.

**One api instance only.** Uploaded files are on local disk
(`STORAGE_DIR`), so a second api replica would not see what the first
one wrote. Do not scale `api` (`--scale api=2`) until the S3-compatible
storage adapter exists and is configured — see "Still undecided".

Every command below is run on the VPS from the repo's
`infrastructure/compose/` directory, with this alias:

```bash
alias dc='docker compose --env-file .env.prod -f docker-compose.prod.yml'
```

## First deploy

### 1. Machine and DNS

- A VPS with Docker Engine + the compose plugin (`docker compose version`
  ≥ 2.20), ports 80 and 443 open, 2 GB RAM minimum.
- DNS `A` (and `AAAA` if the box has IPv6) records for `api.<DOMAIN>`,
  `staff.<DOMAIN>`, `app.<DOMAIN>` pointing at the machine. Caddy cannot
  obtain certificates until these resolve publicly — check with
  `dig +short api.<DOMAIN>` from somewhere else before step 6.
- `git clone` the repo (only `infrastructure/` is needed at runtime: the
  compose file, Caddyfile, backup scripts and `postgres-init/`).

### 2. Images

CI publishes `serenemed-api`, `serenemed-staff-web` and
`serenemed-patient-web` to GHCR on every push to `main`, tagged `latest`
and `sha-<commit>` (`.github/workflows/ci.yml`). Before the first web
image is usable, set the GitHub **repository variable**
`NEXT_PUBLIC_API_URL` to `https://api.<DOMAIN>` (Settings → Secrets and
variables → Actions → Variables) and re-run the workflow: that value is
compiled into the web bundles. Without it, CI builds against the
placeholder `https://api.example.com`, and the web apps will deploy fine
but every API call from the browser will fail.

If the GHCR packages are private, log the VPS in once:
`echo <PAT with read:packages> | docker login ghcr.io -u <user> --password-stdin`.

### 3. `.env.prod`

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod
```

Fill in every value; the comments in the file say what each one is.
Generate secrets with `openssl rand -base64 48`. The ones that break the
boot if wrong: `JWT_SECRET`, `INTEGRATION_ENCRYPTION_KEY` (≥32 chars),
`DATABASE_URL`/`DIRECT_DATABASE_URL` (must carry `sslmode=`, must not
be the dev credentials), `DEFAULT_ORGANIZATION_ID` (not `seed-org` /
`demo-clinic`). The api validates all of this at start
(`packages/config/src/env.ts`) and prints every problem at once.

Keep the two database passwords in sync by hand: `POSTGRES_PASSWORD` ↔
the password inside `DIRECT_DATABASE_URL`, `APP_DB_PASSWORD` ↔ the
password inside `DATABASE_URL`. Compose does not substitute one
variable into another.

Note: `.env.prod` is also the api container's `env_file`, so the api
sees `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and the `AWS_*` backup
credentials as environment variables it never reads. Acceptable on a
single box; split the file if that ever matters.

### 4. Database up, app role password

```bash
dc up -d postgres redis
dc logs postgres | grep -i "init process complete"   # first boot only
```

On a fresh volume the init script
(`infrastructure/docker/postgres-init/01-app-role.sql`) creates the
non-superuser role `serenemed_app` **with the dev password**. Change it
to `APP_DB_PASSWORD` before the api starts (the api refuses the dev
credential in production):

```bash
dc exec postgres psql -U serenemed -d serenemed \
  -c "ALTER ROLE serenemed_app PASSWORD '<APP_DB_PASSWORD>'"
```

### 5. Migrations

The runtime image has no Prisma CLI (it is a devDependency; the image is
built with `pnpm deploy --prod`). Run the CLI through `npx`, pinned to
the version `@prisma/client` in the image was generated with (6.19.x —
check `pnpm-lock.yaml`), with the superuser URL:

```bash
dc run --rm --no-deps --entrypoint sh api -c \
  'npx --yes prisma@6.19.3 migrate deploy --schema prisma/schema.prisma'
```

`DIRECT_DATABASE_URL` is in `.env.prod`, so no extra flags. This needs
outbound internet from the box (npx downloads the CLI). Alternative with
no network inside the container: run it from any machine that has the
full workspace installed, pointing `DIRECT_DATABASE_URL` at the VPS over
an SSH tunnel (`pnpm --filter api exec prisma migrate deploy`, see
deployment.md "Running database migrations").

`prisma migrate deploy` takes an advisory lock; running it twice is
harmless.

### 6. Everything up

```bash
dc up -d
dc ps            # every service "healthy" within ~1 minute
dc logs caddy    # look for "certificate obtained successfully" ×3
```

`curl -I https://api.<DOMAIN>/health/ready` must return `200`. If Caddy
logs ACME errors, the DNS from step 1 is not pointing here yet or port
80 is blocked; fix and `dc restart caddy` (Let's Encrypt rate-limits
failed attempts, so do not loop on this).

### 7. First admin

The image ships the compiled bootstrap script
(`dist/scripts/bootstrap-production.js`). It creates exactly one
organization and one admin in an **empty** database and refuses to run
otherwise (deployment.md "First admin / production bootstrap").

```bash
dc run --rm --no-deps \
  -e BOOTSTRAP_ORG_ID=acme-clinic \
  -e BOOTSTRAP_ORG_NAME="Acme Clinic" \
  -e BOOTSTRAP_ADMIN_EMAIL=admin@acme-clinic.example \
  -e BOOTSTRAP_ADMIN_PASSWORD='<generated password>' \
  -e BOOTSTRAP_ADMIN_NAME="Acme Admin" \
  api node dist/scripts/bootstrap-production.js
```

`BOOTSTRAP_ORG_ID` must equal `DEFAULT_ORGANIZATION_ID` in `.env.prod`,
or patient signup/login returns 503. Then sign in at
`https://staff.<DOMAIN>` and change the password.

### 8. Prove the backup path once

```bash
dc exec db-backup bash /scripts/backup.sh
dc exec db-backup bash /scripts/verify-backup.sh
```

Both must end with their `done` / `OK` line. From now on `db-backup`
runs `backup.sh` nightly at `BACKUP_AT` in `CLINIC_TZ` (default 02:00
Asia/Kolkata); `dc logs db-backup` is the audit trail.

## Updating to a new image tag

```bash
# pick the commit CI built: sha-<40 hex> from the Actions run, or latest
sed -i 's/^TAG=.*/TAG=sha-<commit>/' .env.prod
dc pull
dc run --rm --no-deps --entrypoint sh api -c \
  'npx --yes prisma@6.19.3 migrate deploy --schema prisma/schema.prisma'   # if the release has migrations
dc up -d            # recreates only the services whose image changed
dc ps
```

Take a backup first if the release carries a migration (`dc exec
db-backup bash /scripts/backup.sh`). There is a short outage while each
container is replaced — no blue/green on a single box.

## Rolling back

Code: set `TAG` back to the previous `sha-…` and `dc up -d`. Prisma
migrations are forward-only: if the bad release added a migration that
the old code cannot live with, restore the pre-release backup (next
section) **and** roll the tag back together. Always pin `TAG` to a SHA
in production so "previous" is a known value, not whatever `latest` was.

## Restoring a backup

Backups are in the `backups` volume: `/backups/daily/` (newest 14) and
`/backups/weekly/` (Sunday copies, newest 8). Each night produces
`serenemed-<stamp>.dump` (pg_dump custom format) and
`serenemed-<stamp>-storage.tar.gz` (uploaded files). List them:

```bash
dc exec db-backup ls -l /backups/daily /backups/weekly
```

1. Stop the api so nothing holds locks or writes during the restore:
   `dc stop api`.
2. Dry run (prints the plan, changes nothing):
   `dc exec db-backup bash /scripts/restore.sh /backups/daily/<file>.dump serenemed`
3. Database only:
   `dc exec db-backup bash /scripts/restore.sh /backups/daily/<file>.dump serenemed --yes`
   — runs `pg_restore --clean --if-exists --single-transaction`; a
   failure rolls everything back.
4. Uploaded files too: the sidecar mounts the storage volume read-only,
   so run the same restore from a one-off container with it writable:
   ```bash
   dc run --rm --no-deps -v serenemed_serenemed-storage:/data/storage db-backup \
     bash /scripts/restore.sh /backups/daily/<file>.dump serenemed \
       --storage /backups/daily/<file>-storage.tar.gz --yes
   ```
   (`serenemed_` is the compose project prefix; `docker volume ls`
   shows the exact name.)
5. `dc start api`, then `curl https://api.<DOMAIN>/health/ready`.

A dump from an older release restores `_prisma_migrations` with it, so
run `migrate deploy` again afterwards if the running image is newer than
the dump.

To restore onto a different machine: do first-deploy steps 1–4 there
(the image creates the empty `serenemed` database and the init script
creates the roles), copy the dump and tar into its `backups` volume
(`docker cp <file> $(dc ps -q db-backup):/backups/daily/`), then restore
as above before starting the api.

## Rotating `JWT_SECRET`

Change the value in `.env.prod` and `dc up -d api`. Effect: every
access and refresh token signed with the old secret fails verification
immediately — **all staff and patients are signed out** and must log in
again. There is no dual-secret grace window. Do it at a quiet hour and
tell the clinic. Revocation markers in Redis are keyed by token id and
are unaffected.

## Rotating `INTEGRATION_ENCRYPTION_KEY` — not supported yet

Integration API keys (staff app, Integrations page) are encrypted at
rest with this key (AES-256-GCM). **There is no re-encryption tool**:
changing the key makes every saved integration key unreadable, and the
only recovery is an administrator re-entering each key on the
Integrations page. If the key must change (suspected leak): change it in
`.env.prod`, `dc up -d api`, then re-enter the keys. Keep a copy of the
current key in the password manager; losing it is the same event. See
`docs/architecture/open-questions.md` #17.

## Checking health

```bash
dc ps                                   # STATUS column: healthy / unhealthy
curl -s https://api.<DOMAIN>/health/ready   # {"status":"ready",...} or 503
curl -I https://staff.<DOMAIN>/             # 200
curl -I https://app.<DOMAIN>/               # 200
```

`api` is unhealthy when it cannot reach Postgres or Redis
(`/health/ready` checks both for real). Caddy waits for all three apps
to be healthy before it starts, so a 502 from Caddy right after `up`
is normal for the first ~30 s. Certificate status: `dc logs caddy | grep
-i certificate` shows issuance and renewals (Caddy renews on its own
about 30 days before expiry).

Disk: `docker system df -v` shows volume sizes; `backups` grows to about
22 dumps + 22 tars.

## Reading logs

```bash
dc logs -f api                 # JSON lines, one per request/event
dc logs --since 1h caddy       # access + ACME log
dc logs db-backup              # one block per nightly run, "backup FAILED" on error
dc logs -f --tail 100          # everything
```

Logs rotate at 20 MB × 5 files per container (`x-logging` in the
compose file). The api logs are structured JSON; `dc logs api | grep
'"level":"error"'` finds errors. With `SENTRY_DSN` set, exceptions also
go to Sentry.

## Local dev equivalents

Against the root `docker-compose.yml` stack (Postgres published on
`POSTGRES_HOST_PORT`, 5433 on this machine's checkout):

```bash
PGPORT=5433 BACKUP_DIR=/tmp/serenemed-backups infrastructure/backup/backup.sh
PGPORT=5433 BACKUP_DIR=/tmp/serenemed-backups infrastructure/backup/verify-backup.sh
PGPORT=5433 infrastructure/backup/restore.sh /tmp/serenemed-backups/daily/<file>.dump serenemed --yes
```

Needs a Postgres 16 client on the host (`brew install libpq`), or run
them inside the dev container:
`docker exec -e BACKUP_DIR=/tmp/b serenemed-postgres bash -s < infrastructure/backup/backup.sh`.

## Still undecided (needs a hosting decision)

- **Which VPS / provider**, and whether Postgres and Redis stay in
  containers on it or move to managed services. The compose file is
  written so the latter is "delete two services, change two URLs,
  switch `sslmode` to `require`".
- **Off-site backups.** The `backups` volume is on the same disk as the
  database. `BACKUP_S3_URL` + `AWS_*` in `.env.prod` turn on an upload to
  any S3-compatible bucket; the bucket does not exist yet.
- **Uploaded-file storage.** Local disk today (one api instance). The
  intended target is an S3-compatible bucket through the existing
  `S3_*` variables, once the adapter is built and a bucket chosen.
- **HTTPS is configured, not proven.** The Caddyfile validates and the
  container's health check passes, but no real domain has been pointed
  at this stack, so certificate issuance has not been observed end to
  end.
- **Monitoring/alerting.** Nothing pages anyone when `db-backup` logs
  `backup FAILED` or a container goes unhealthy. A `restart:
unless-stopped` policy restarts crashed containers; it does not
  restart unhealthy-but-running ones.
