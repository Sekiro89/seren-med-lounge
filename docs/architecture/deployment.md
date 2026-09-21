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

**Enforced, not just documented**: `packages/config/src/env.ts`'s
`apiEnvSchema` refuses to boot at all if `NODE_ENV=production` and
`JWT_SECRET` is still the exact placeholder text above, or if
`DATABASE_URL`/`DIRECT_DATABASE_URL` still contain the local-dev
`serenemed_app:serenemed_app` / `serenemed:serenemed` credentials
(`infrastructure/docker/postgres-init/01-app-role.sql`,
`docker-compose.yml`). A schema that only checked "is `JWT_SECRET`
longer than 16 characters" would have happily accepted the placeholder
— it's 34 characters — and let the app go live with a secret that's
sitting in this repo's git history. Verified live: production mode with
the placeholder/dev values present correctly refuses to start (Zod
lists all three issues at once); production mode with real-looking
values boots past validation normally; development mode with the exact
same placeholder/dev values is correctly unaffected, since local dev is
expected to use them.

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

## Error tracking (Sentry) — wired, inactive until configured

`@sentry/node` is installed and `Sentry.init()` runs at the top of
`main.ts`, but **only if `SENTRY_DSN` is set** — unset (the default),
it's a real no-op, same optional-until-configured shape as the S3/
payments/messaging env vars already in `.env.example`. A global
`SentryExceptionFilter` (`common/filters/sentry-exception.filter.ts`)
reports every exception via `Sentry.captureException()` and then
delegates to Nest's own `BaseExceptionFilter` for the actual HTTP
response, unchanged — it's an observer, not a response-shaping filter.

What's verified, without a real Sentry account (there still isn't one):

- A real unhandled exception thrown from a live route, run through the
  actual Nest HTTP pipeline (not a hand-mocked host), triggers
  `captureException` exactly once and still gets Nest's normal
  unchanged response (`apps/api/src/common/filters/sentry-exception.filter.spec.ts`).
- The full unit + e2e suite still passes. Caveat worth being honest
  about: the e2e specs build the app straight from `AppModule` via
  `Test.createTestingModule`, bypassing `main.ts`'s `bootstrap()`
  entirely — same as they've never exercised helmet/CORS/the global
  `ValidationPipe` either. So that pass doesn't by itself prove the
  filter behaves inside the real bootstrap path.
- To cover that gap, the actual dev server (`pnpm run start:dev`, going
  through real `bootstrap()`) was started and hit with a spread of real
  error-producing requests (401 unauthenticated, 401 garbage token, 400
  Zod validation error, 404 unknown route) — all four responses came
  back byte-for-byte what they were before this filter existed.
- The full production Docker image was rebuilt and booted against fresh
  Postgres+Redis with `SENTRY_DSN` set to a syntactically valid but fake
  DSN — confirmed the app still starts cleanly and serves `/health/ready`
  and a real 404 correctly, i.e. `Sentry.init()` against an
  unreachable/fake project doesn't crash the process.

What's **not** verified, and can't be without a real account: that a
captured exception is actually delivered to a Sentry project.
`captureException` is a documented safe no-op without `Sentry.init()`
having run — that guarantee is Sentry's, not something re-tested here.

## Dependency vulnerabilities

CI runs `pnpm audit --prod --audit-level high` on every push (the
`checks` job) — fails on high/critical findings, ignores low/moderate
noise so the check stays a real signal instead of constant churn.

When it fails: check whether the vulnerable package is something this
app actually chose (upgrade it directly) or a transitive dependency of
something else (the common case) — `pnpm why <package> --filter api`
shows the path. For a transitive one, pin the patched version via
`pnpm.overrides` in the root `package.json` rather than trying to
upgrade whatever pulled it in (which may not have released a fix yet,
or may not be upgradable without other breakage).

The three currently pinned there (`tar`, `multer`, `deepmerge-ts`) came
in via `bcrypt`'s native-binary installer, `@nestjs/platform-express`'s
bundled multipart parser, and Prisma's config loader, respectively — 17
advisories (1 critical, 12 high) fixed this way, none from a package
this app depends on directly. The `tar` fix was a major version bump
(6→7) for a dependency of `bcrypt`'s install tooling — the one with real
risk of quietly breaking something (a native module's build step) —
verified by actually re-running `bcrypt.hash`/`.compare`, the full
test/e2e suite, and rebuilding the production Docker image with
`--no-cache` to force a genuinely fresh install inside Alpine, not by
assuming a version bump was safe because `pnpm install` didn't error.

## Horizontal scaling — verified with real multiple instances

Everything above was tested against one running instance at a time.
This app's original motivation for going Redis-backed (the rate
limiter, `docs/architecture/security.md#rate-limiting`; JWT revocation,
`docs/architecture/security.md#token-revocation`) was specifically to
survive running more than one — so that claim was tested for real:
built the production image, ran **two separate containers** of it
against one shared Postgres + Redis (not one instance twice — two
independent `docker run`s, each with its own container, both pointed at
the same backing services), and:

- Logged in via instance A, confirmed the token worked on instance B
  too (same token, no instance-specific state). Logged out via instance
  A. Instance B — which never received that logout request — then
  independently rejected the same token. That's only possible if both
  instances are checking the same revocation store, not two separate
  in-memory blacklists.
- Sent login attempts split across both instances (alternating which
  one received each request). The shared 5/min limit tripped correctly
  based on the _combined_ count across both containers, not per
  instance — the in-memory default this replaced would have allowed 5
  on instance A _and_ 5 more on instance B before either individually
  noticed.

This is the concrete answer to "does this actually work with more than
one instance," not an inference from "the code uses Redis so it should."

## Image publishing (GitHub Container Registry) — not the same as deploying

`.github/workflows/ci.yml`'s `publish-image` job builds the same
`apps/api/Dockerfile` proven above and pushes it to
`ghcr.io/<owner>/serenemed-api` on every push to `main`, tagged both
`latest` and the full commit SHA — but only after both the `checks` and
`db-tests` jobs pass, so a broken commit never gets published. This
does **not** deploy anywhere; it just means a tested image exists
somewhere other than a developer's laptop, ready to be pulled by
whatever host gets chosen later. Uses the repo's own `GITHUB_TOKEN`
(package-write permission granted explicitly in that job, since the
repo's default workflow permission is read-only) — no separate registry
account or secret needed.

## Not done yet

- **No hosting target chosen.** The Dockerfile is host-agnostic (works
  on Fly/Railway/Render/ECS/k8s/a plain VPS running `docker run`) —
  deliberately deferred rather than building against a guess.
- **No actual deploy step.** Publishing the image (above) isn't the
  same as running it anywhere — once a host is picked, that host still
  needs to be told to pull and run `ghcr.io/<owner>/serenemed-api:latest`
  (or a specific SHA tag).
- **No frontend Dockerfiles.** `apps/patient-web`/`apps/staff-web`
  aren't containerized or published yet — same pattern should apply
  once/if they're needed for the same launch.

## Already closed (was "Not done yet")

Distributed rate limiting, structured logging, graceful shutdown, a real
readiness check, gating `/docs` in production, and error tracking
(above) — see `app.module.ts` (Redis-backed `ThrottlerStorageRedisService`,
sharing `RedisService`'s connection), `main.ts` (`enableShutdownHooks()`,
the `NODE_ENV==='production'` guards around Swagger and the logger),
`common/json-logger.service.ts`, and `GET /health/ready`
(`app.service.ts` — checks real Postgres + Redis reachability, not just
"the process is up"). All verified live: the Redis-backed throttler's
keys were confirmed actually landing in Redis
(`docker exec ... redis-cli keys`), `/docs` confirmed 200 in dev and 404
with `NODE_ENV=production`, the JSON logger's output confirmed to be
100% valid JSON lines end to end, and `/health/ready` confirmed live
against real Postgres + Redis.
