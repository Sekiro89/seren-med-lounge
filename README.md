# SereneMed Lounge

**Digital Clinic Operating System.** A pnpm monorepo housing three
interfaces built around one shared clinical/business spine.

> **Status:** architecture initialization complete. Domain module
> boundaries, the database shell, the integration abstraction layer, and
> the role/permission architecture exist and build/lint/test cleanly.
> Business workflows are not implemented yet — see
> [`docs/architecture/domain-modules.md`](docs/architecture/domain-modules.md)
> for what's a real module vs. a boundary placeholder.

## What SereneMed is

A modular-monolith backend serving two frontends:

1. **Patient interface** (`apps/patient-web`) — registration, appointment
   booking, video consultation, payments, records, reports,
   prescriptions, messages, follow-ups, consent, notifications. Consumes
   the backend API; never duplicates clinical data locally.
2. **Staff workspaces** (`apps/staff-web`) — one application, ten
   role-scoped workspaces (Administrator, Reception, Nurse, Junior
   Doctor, Senior Doctor, Surgery Coordinator, Pharmacy, Billing,
   Insurance, Marketing), not ten separate apps.
3. **Unified Patient Record** — not an app. The central domain/data
   spine (`apps/api`) that every workflow — CRM/marketing, the clinic
   journey, clinical records, billing, pharmacy, follow-up — attaches to
   by `patientId`. See
   [`docs/database/erd.md`](docs/database/erd.md).

Supporting integrations (payments, WhatsApp/messaging, labs, insurance,
Zoho/accounting, video consultation, AI consultation assistant) sit
behind adapter interfaces in `apps/api/src/integrations/*` — see
[`docs/architecture/integrations.md`](docs/architecture/integrations.md).

## Architecture

- **Modular monolith**, not microservices — one NestJS backend, ~40
  domain module boundaries, most still lean shells awaiting their first
  real workflow.
- **RBAC enforced server-side** via a global `PermissionsGuard`; the
  frontend's `can()` check only controls rendering.
- **Clinical record immutability**: finalized clinical records are never
  mutated in place — corrections create a new version.
- **AI is draft-only**: the AI consultation assistant can never finalize
  a clinical record; only a doctor's sign-off can.

Full detail: [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md),
[`domain-modules.md`](docs/architecture/domain-modules.md),
[`security.md`](docs/architecture/security.md),
[`open-questions.md`](docs/architecture/open-questions.md).

## Monorepo layout

```
apps/
  patient-web/    Next.js — patient interface
  staff-web/      Next.js — staff workspaces (workspaces/<role>/)
  api/            NestJS — backend (src/<domain-module>/)
packages/
  ui/             Shared React components
  types/          Shared enums/types (roles, statuses)
  validation/     Shared Zod schemas (frontend + backend DTOs)
  permissions/    Role → permission matrix
  api-client/     Typed fetch client used by both frontends
  config/         Shared env-schema validation
  utils/          Small framework-agnostic helpers
infrastructure/
  docker/, database/, deployment/   (reserved for growth)
docs/
  architecture/, database/, api/, workflows/, integrations/
```

## Technology

| Layer           | Choice                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Frontend        | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query, React Hook Form, Zod |
| Backend         | NestJS 11, TypeScript, REST, Swagger/OpenAPI (`/docs` once running)                                 |
| Database        | PostgreSQL, Prisma ORM                                                                              |
| Infra           | Redis, BullMQ, S3-compatible object storage, Docker Compose                                         |
| Testing         | Jest, Supertest (API); Playwright (planned, not yet wired)                                          |
| Code quality    | ESLint (flat config), Prettier, Husky, lint-staged                                                  |
| Package manager | pnpm workspaces                                                                                     |

## Local setup

Prerequisites: Node ≥ 20, pnpm ≥ 9, Docker.

```bash
pnpm install

# build shared packages once before running the apps
pnpm --filter "./packages/*" build

# Prisma/NestJS read .env from apps/api/ (not the repo root)
cp .env.example apps/api/.env      # fill in real values for anything you're testing
pnpm docker:up                      # PostgreSQL (5432) + Redis (6379)

pnpm --filter api run prisma:generate
pnpm --filter api exec prisma migrate deploy   # creates the initial tables + RLS policies

pnpm dev:api                # http://localhost:4000  (Swagger at /docs)
pnpm dev:patient             # http://localhost:3000
pnpm dev:staff                # http://localhost:3001
```

**If port 5432 is already taken** (a native/Homebrew Postgres is a common
culprit — check with `lsof -nP -iTCP:5432 -sTCP:LISTEN`), set
`POSTGRES_HOST_PORT` before bringing containers up and match it in both
`DATABASE_URL`/`DIRECT_DATABASE_URL`:

```bash
POSTGRES_HOST_PORT=5433 pnpm docker:up
```

**Why two database URLs**: `DATABASE_URL` (what the app runs as) must be
the non-superuser `serenemed_app` role created by
`infrastructure/docker/postgres-init/01-app-role.sql` on first container
start — Postgres superusers always bypass Row-Level Security, so
connecting the app as the superuser `serenemed` role would make the
tenant-isolation policies silently do nothing. `DIRECT_DATABASE_URL`
(the `serenemed` superuser) is used only by `prisma migrate`. See
[`docs/architecture/security.md#row-level-security`](docs/architecture/security.md#row-level-security)
— this was a real bug in an earlier version of this setup, caught by
actually running it, not by lint/typecheck/build.

After migrating, two checks run against the real database (not part of
the root `pnpm test`, which only runs unit tests — both of these need
Postgres up):

- `pnpm --filter api run verify:tenant-isolation` — manual script,
  asserts Row-Level Security and the soft-delete convention behave as
  documented at the Prisma level.
- `pnpm --filter api run test:e2e` — Jest/Supertest, drives the full
  login → JWT → guard → tenant-isolation HTTP path end to end (default-
  deny, RBAC, cross-org isolation).

Worth running both after touching auth, `PrismaService`, or the RLS
policies.

**Logging in (staff)**: there's no signup flow yet — `POST /users`
requires an already-authenticated admin. To get a first user:

```bash
pnpm --filter api exec ts-node -O '{"module":"commonjs"}' scripts/seed-dev.ts
# prints a staff email+password AND a patient email+password (same org, same password)

curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"organizationId":"seed-org","email":"admin@dev.local","password":"dev-password-123"}'
# → { accessToken, user }

curl http://localhost:4000/users -H "Authorization: Bearer <accessToken>"
```

**Logging in (patient)**: same shape, different endpoint and table —
`patient-web`'s `/login` page (`apps/patient-web/app/login`) is a real,
working form against this:

```bash
curl -X POST http://localhost:4000/auth/patient/login \
  -H 'Content-Type: application/json' \
  -d '{"organizationId":"seed-org","email":"patient@dev.local","password":"dev-password-123"}'
# → { accessToken, patient }

curl http://localhost:4000/patients/me -H "Authorization: Bearer <accessToken>"
```

`scripts/seed-dev.ts` is dev-only — see its header comment. Every route
except `/health`, `/auth/login`, and `/auth/patient/login` requires an
`Authorization` header; see
[`docs/architecture/security.md#authentication--staff-access-tokens-only`](docs/architecture/security.md#authentication--staff-access-tokens-only)
and
[`#patient-authentication`](docs/architecture/security.md#patient-authentication).

## Development commands

```bash
pnpm build          # build every app/package
pnpm lint           # lint every app/package
pnpm typecheck      # typecheck every app/package
pnpm test           # run tests (currently: apps/api)
pnpm format         # prettier --write across the repo
pnpm docker:up       # start Postgres + Redis
pnpm docker:down     # stop them
```

Per-app equivalents: `pnpm --filter api run <script>`,
`pnpm --filter patient-web run <script>`, `pnpm --filter staff-web run <script>`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push
and pull request to `main`, as two parallel jobs:

- **`checks`** — format check, lint, typecheck, build, unit tests. No
  database.
- **`db-tests`** — spins up a real `postgres:16-alpine` service
  container, applies `infrastructure/docker/postgres-init/01-app-role.sql`
  by hand (GitHub Actions service containers don't get docker-compose's
  `docker-entrypoint.initdb.d` mount), runs `prisma migrate deploy`, then
  `verify:tenant-isolation` and the full `test:e2e` suite against it —
  the same two checks called out above under "Local setup", just
  automated instead of a manual step you have to remember to run.

Not required to merge yet — branch protection isn't turned on for
`main`, so a red run doesn't currently block anything. All env values
used in CI (JWT secret, DB credentials) are the same non-secret
local-dev values already in `.env.example`; no GitHub Secrets are needed
for this workflow.

## Deployment

All three apps build into production containers — `docker build -f
apps/api/Dockerfile -t serenemed-api .` (run from the repo root; same
pattern for `apps/patient-web` and `apps/staff-web`, which additionally
need `--build-arg NEXT_PUBLIC_API_URL=...`). CI also auto-publishes the
API image to `ghcr.io/<owner>/serenemed-api` on every push to `main`.
See [`docs/architecture/deployment.md`](docs/architecture/deployment.md)
for what's actually been verified (each image booted for real against
live Postgres + Redis / real HTTP routes) versus what's intentionally
not decided yet (hosting target, CD/deploy step).

## Environment

See [`.env.example`](.env.example) for every variable the system will
eventually need (database, Redis, JWT, object storage, payments,
messaging/WhatsApp, AI, Zoho, labs, insurance). Never commit a real
`.env` file — it's gitignored.

## Where to look next

- Adding a backend workflow: [`docs/architecture/domain-modules.md`](docs/architecture/domain-modules.md)
- Adding an external integration: [`docs/architecture/integrations.md`](docs/architecture/integrations.md)
- Understanding a specific clinic workflow: `docs/workflows/*.md`
- Unresolved product decisions: [`docs/architecture/open-questions.md`](docs/architecture/open-questions.md)
