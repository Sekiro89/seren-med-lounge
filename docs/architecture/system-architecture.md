# System Architecture

SereneMed Lounge is a **modular monolith**, not a microservices system. One
backend process (`apps/api`) hosts every domain module; two frontends
(`apps/patient-web`, `apps/staff-web`) consume it over REST.

```
apps/patient-web        apps/staff-web
   (Next.js)               (Next.js)
        \                     /
         \                   /
              apps/api (NestJS)
   Auth · Users/Roles · Patients · CRM/Marketing
   Appointments · Registration · Queue · Encounters
   Clinical (vitals, notes, diagnoses, prescriptions)
   Labs · Procedures/Surgery · Pharmacy · Inventory
   Billing · Payments · Insurance · Accounting
   Follow-ups · Notifications · AI · Integrations · Audit
                    |
        ┌───────────┼───────────┐
        ▼                       ▼
   PostgreSQL                 Redis
   (Prisma)              (BullMQ queues/jobs)
        |
        ▼
   Object storage (documents, reports, attachments)
```

## Why a modular monolith

- One deployable backend keeps transactions, joins, and cross-domain
  workflows (e.g. "finalize a clinical note → generate an invoice →
  trigger a notification") simple and consistent — no distributed
  transactions, no service-to-service auth, no network hop per domain call.
- Domain boundaries are enforced by **module structure and code review**,
  not by network calls. Each NestJS module in `apps/api/src/*` owns its
  slice and is the only thing allowed to import its own Prisma models
  directly.
- If a specific module ever needs independent scaling or a different
  runtime, it can be extracted later — the module boundary already exists
  in the code, which is what makes that extraction tractable. This is not
  planned or scheduled; it is just why the boundaries matter now.

## The three interfaces

1. **Patient Interface** (`apps/patient-web`) — patients interact with
   their own Unified Patient Record through the API, scoped by their own
   identity. It never duplicates clinical/business data locally.
2. **Unified Patient Record** — not an app, the domain/data spine every
   workflow attaches to. See `domain-modules.md` and `docs/database/erd.md`.
3. **Staff Workspaces** (`apps/staff-web`) — one application, ten
   role-scoped workspaces (`apps/staff-web/workspaces/*`). Roles differ in
   what renders and what the backend authorizes, not in which app they run.

## Request flow (typical)

```
Browser (patient-web / staff-web)
  → TanStack Query hook
  → @serenemed/api-client (fetch wrapper)
  → apps/api REST endpoint
  → NestJS Guard (auth) → PermissionsGuard (RBAC)
  → Controller → Service → PrismaService → PostgreSQL
  → (side effects) → BullMQ job → NotificationsModule → Integration adapter
```

## Cross-cutting concerns

| Concern         | Where it lives                                                                               |
| --------------- | -------------------------------------------------------------------------------------------- |
| Authentication  | `apps/api/src/auth` (JWT issuance — not yet implemented)                                     |
| Authorization   | `apps/api/src/common/guards/permissions.guard.ts` + `@serenemed/permissions`                 |
| Validation      | `@serenemed/validation` (Zod) consumed by both frontends and the API via `ZodValidationPipe` |
| Multi-tenancy   | `organizationId` / `clinicId` columns — see `docs/database/erd.md`                           |
| Background jobs | Redis + BullMQ (wired per-module as each workflow needs it)                                  |
| File storage    | Object storage; Postgres stores only metadata/references                                     |
| Integrations    | `apps/api/src/integrations/*` — interface + stub adapter per vendor                          |

See also: `domain-modules.md`, `security.md`, `integrations.md`,
`../database/erd.md`, `open-questions.md`.
