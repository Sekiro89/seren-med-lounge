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

cp .env.example .env      # fill in real values for anything you're testing
pnpm docker:up             # PostgreSQL (5432) + Redis (6379)

pnpm --filter api run prisma:generate
pnpm --filter api run prisma:migrate   # creates the initial tables

pnpm dev:api                # http://localhost:4000  (Swagger at /docs)
pnpm dev:patient             # http://localhost:3000
pnpm dev:staff                # http://localhost:3001
```

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
