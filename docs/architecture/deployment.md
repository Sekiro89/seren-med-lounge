# Deployment

What's real today: `apps/api` builds into a production container image
and has been booted from that exact image against a live Postgres +
Redis, logged in through it, and confirmed default-deny + RLS still
hold end to end. What's **not** built yet, deliberately: which host runs
that image, and any CI/CD pipeline that pushes it there — see "Not done
yet" at the bottom.

## Building the image

```bash
# Run from the REPO ROOT, not apps/api/ — the build needs the whole
# pnpm workspace, since the api depends on packages/* via `workspace:*`.
docker build -f apps/api/Dockerfile -t serenemed-api .
```

Multi-stage build (`apps/api/Dockerfile`):

1. **builder** — full workspace install (incl. devDependencies, needed
   for `nest build`/`tsc`/`prisma generate`), builds `packages/*` then
   `apps/api`, then runs `pnpm --filter api deploy --prod /prod/api` —
   pnpm's purpose-built tool for producing one self-contained,
   prod-dependency-only deployable from a single package in a workspace
   (`workspace:*` deps like `@serenemed/validation` get resolved to real
   copied files, not symlinks, so the result has no dependency on the
   rest of the monorepo being present).
2. **runtime** — just `node:20-alpine` + the deployed output. No
   devDependencies, no other apps' `node_modules`, ~532MB.

Two real bugs this surfaced, only visible by actually running the built
image (not from reading the Dockerfile or `docker build` succeeding —
both steps below completed with no error and still produced a broken
image):

- **`pnpm deploy` resets the Prisma client.** It reinstalls
  `@prisma/client` into its own fresh virtual store as part of building
  `/prod/api`, which re-triggers `@prisma/client`'s postinstall and
  wipes the already-generated client from the earlier `prisma generate`
  step back to its "did not initialize yet" placeholder. Fixed by
  running `prisma generate` a second time, against the deployed schema,
  using the CLI that's still present in the builder stage (it's a
  devDependency, so it doesn't exist in `/prod/api` itself):
  `pnpm --filter api exec -- prisma generate --schema=/prod/api/prisma/schema.prisma`.
- **`dist/main.js` doesn't exist.** `tsconfig.build.json` sets no
  `rootDir`, so TypeScript infers it from the union of `src/` and
  `scripts/`, which nests the compiled output under `dist/src/` instead
  of `dist/` directly. The Dockerfile's `CMD` needed `dist/src/main.js`
  — and so, it turned out, did `apps/api/package.json`'s own
  `start:prod` script, which had the same wrong path and had apparently
  never actually been run before (dev always uses `start:dev`, which
  runs through `ts-node`/`nest start --watch`, not the compiled output).
  Both are fixed now.

Also confirmed: `pnpm prune --prod` (the more obvious choice) silently
no-ops inside a non-interactive `docker build` — it prints an
interactive confirmation prompt and skips the actual pruning when
nothing answers it, so the image size never actually drops and
devDependencies like `jest`/`typescript`/the `prisma` CLI stay in.
That's why the Dockerfile uses `pnpm deploy` instead.

## Running database migrations

**Deliberately not baked into the image's startup.** If it were, every
running replica would need the superuser `DIRECT_DATABASE_URL`
credential just to boot — more exposure than the migration step needs.
Instead, run this once, from a machine with the full (non-pruned)
workspace install, before new instances of the image start serving
traffic:

```bash
DIRECT_DATABASE_URL=<production superuser URL> \
  pnpm --filter api exec prisma migrate deploy
```

`prisma migrate deploy` takes an advisory lock, so it's safe to run from
CI or a deploy script without extra coordination even if triggered more
than once. There's no automated place this runs from yet — see "Not
done yet".

## Production Postgres

Whatever host runs it, the database needs the same two-role split as
local dev (`infrastructure/docker/postgres-init/01-app-role.sql`,
already idempotent — safe to run against a fresh database):

- A superuser/owner role for `prisma migrate deploy` only
  (`DIRECT_DATABASE_URL`).
- A non-superuser `serenemed_app` role (`NOSUPERUSER NOBYPASSRLS`) for
  the running app (`DATABASE_URL`) — **required**, not optional:
  Postgres superusers always bypass Row-Level Security regardless of
  `FORCE ROW LEVEL SECURITY`, so if the app ever connects as the
  superuser, every tenant-isolation policy silently does nothing. See
  `docs/architecture/security.md#row-level-security`.

Run `01-app-role.sql` once against the fresh production database (most
managed Postgres providers let you run arbitrary SQL as the initial
owner role), then run migrations as above.

Whatever's chosen also needs real backups/point-in-time recovery — a
docker volume (what local dev uses) has neither. Not decided yet: which
managed Postgres provider, so not built.

## Redis

`RedisService` (`apps/api/src/redis/redis.service.ts`) connects to
`REDIS_URL` at boot — a reachable Redis is required to start the app at
all, not just for the not-yet-distributed rate limiter. Any managed
Redis (or a self-hosted instance) works; nothing here is provider-specific.

## Secrets

`JWT_SECRET` in `.env.example` is a literal placeholder
(`replace-with-a-long-random-string`) — never deploy with it. Generate a
real one and store it in whatever the eventual host's secret store is
(not committed to the repo, not put in this doc):

```bash
openssl rand -base64 32
```

Everything else in `.env.example` that's still blank (S3, payments,
messaging, AI, Zoho) belongs to integrations that aren't built yet
(see `docs/architecture/integrations.md`) — nothing reads them today, so
there's nothing to configure for them yet.

## First admin / production bootstrap

`scripts/seed-dev.ts` is explicitly dev-only (hardcoded org/credentials,
`upsert`-based so it's safe to re-run). `scripts/bootstrap-production.ts`
is the equivalent for a real deploy: takes org id/name and admin
email/name/password from required env vars (no defaults, no hardcoded
credentials), hashes the password with the same bcrypt cost
`UsersService.create()` uses (12 — this script is a one-time stand-in
for that path, not a second idea of what "correctly hashed" means), and
hard-refuses to run if any `Organization` already exists — it creates
exactly one first admin in an empty database, once, not a general
org-creation tool.

```bash
BOOTSTRAP_ORG_ID=acme-clinic \
BOOTSTRAP_ORG_NAME="Acme Clinic" \
BOOTSTRAP_ADMIN_EMAIL=admin@acme-clinic.example \
BOOTSTRAP_ADMIN_PASSWORD='<a real generated password>' \
BOOTSTRAP_ADMIN_NAME="Acme Admin" \
DIRECT_DATABASE_URL=<production superuser URL> \
  pnpm --filter api exec ts-node -O '{"module":"commonjs"}' scripts/bootstrap-production.ts
```

Verified live end to end against a genuinely empty throwaway Postgres:
ran once (created the org + admin), ran a second time (refused, exit
code 1, nothing created), then actually logged in as the bootstrapped
admin through the real running API and got back a valid JWT — not just
"a row exists in the database," but the exact same bcrypt hash the
login path expects.

What this deliberately doesn't decide: whether an operator invokes this
by hand, as a CI/CD one-off step, or from some future first-run setup
UI — that's a product decision the script doesn't need an answer to
either way.

## Not done yet

- **No hosting target chosen.** The Dockerfile is host-agnostic (works
  on Fly/Railway/Render/ECS/k8s/a plain VPS running `docker run`) —
  deliberately deferred rather than building against a guess.
- **No CD pipeline.** `.github/workflows/ci.yml` only tests; nothing
  builds or pushes an image anywhere yet. Building this depends on the
  hosting decision above.
- **No frontend Dockerfiles.** `apps/patient-web`/`apps/staff-web`
  aren't containerized yet — same `pnpm deploy`-based pattern should
  apply once/if they're needed for the same launch.
- **No error tracking (Sentry or equivalent).** Deliberately not wired:
  there's no real account/DSN to verify delivery against, and stubbing
  in SDK calls that have never actually been confirmed to deliver an
  event anywhere would be exactly the "fake integration that looks
  production-ready" anti-pattern this project avoids elsewhere (see
  `docs/architecture/open-questions.md` #3 on the same reasoning for
  OTP). When there's a real DSN: `@sentry/node`, initialized only if
  `SENTRY_DSN` is set (same optional-until-configured shape as the S3/
  payments/messaging env vars already in `.env.example`), is a small,
  well-understood addition at that point — not attempted blind now.
- **Distributed rate limiting, structured logging, graceful shutdown, a
  real readiness check, and gating `/docs` in production** were all
  fixed in the same pass as this doc — see `app.module.ts` (Redis-backed
  `ThrottlerStorageRedisService`, sharing `RedisService`'s connection),
  `main.ts` (`enableShutdownHooks()`, the `NODE_ENV==='production'`
  guards around Swagger and the logger), `common/json-logger.service.ts`,
  and `GET /health/ready` (`app.service.ts` — checks real Postgres +
  Redis reachability, not just "the process is up"). All verified live:
  the Redis-backed throttler's keys were confirmed actually landing in
  Redis (`docker exec ... redis-cli keys`), `/docs` confirmed 200 in dev
  and 404 with `NODE_ENV=production`, the JSON logger's output confirmed
  to be 100% valid JSON lines end to end, and `/health/ready` confirmed
  live against real Postgres + Redis.
