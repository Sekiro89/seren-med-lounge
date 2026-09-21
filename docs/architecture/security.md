# Security Architecture

## Principles

- **Authorization is enforced server-side, always.** `PermissionsGuard`
  (`apps/api/src/common/guards/permissions.guard.ts`) is registered
  globally via `APP_GUARD`. A frontend `can()` check
  (`apps/staff-web/lib/permissions.ts`) only controls what renders — it is
  never the security boundary.
- **RBAC is data, not code branches.** The role → permission matrix lives
  in `@serenemed/permissions` (`ROLE_PERMISSIONS`), shared by both
  frontends (for rendering) and the API (for enforcement via
  `roleHasPermission`), so there is exactly one place that defines what a
  role can do.
- **Input is validated at the boundary.** Every controller that accepts a
  body validates it against a `@serenemed/validation` Zod schema via
  `ZodValidationPipe`, the same schema the frontend form uses.
- **Secrets never enter git.** `.env.example` documents every variable
  with a placeholder; real values live in untracked `.env` files or a
  secrets manager in deployed environments.
- **Tenant isolation is enforced at the database, not just in `where`
  clauses.** See "Row-level security" below — application code
  forgetting an `organizationId` filter is a real risk in a 40-module
  system with many contributors; the database itself refuses to return
  cross-tenant rows regardless.
- **Deletes are soft by default.** See "Soft delete" below — clinical and
  business data is retained, not destroyed, unless a model is explicitly
  excluded from that convention (currently only `AuditLog`).

## Authentication (planned, not yet implemented)

`apps/api/src/auth` establishes the controller/service boundary
(`POST /auth/login`) but `AuthService.login` currently throws
`NotImplementedException` — there is no user store to check credentials
against yet (`users` module is a lean shell). When implemented:

- Passwords are hashed with argon2id (or bcrypt as a fallback), never
  stored or logged in plaintext.
- Sessions are short-lived JWT access tokens + longer-lived refresh
  tokens (see `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` in `.env.example`),
  not long-lived opaque sessions.
- Patient auth and staff auth are separate credential stores (`Patient`
  vs. `User` in `prisma/schema.prisma`) — a patient is never granted a
  staff role by sharing a table.

## Clinical record immutability

Finalized clinical records (clinical notes, diagnoses, prescriptions,
procedure notes, reports) are **never updated in place**. The lifecycle
is:

```
Draft → (AI Draft, if AI-assisted) → Reviewed → Finalized → Amendment → new Version
```

- A finalized record is closed for writes. Correcting it creates a new
  version linked to the original (`ClinicalNoteVersion`-style table — see
  `docs/database/erd.md`), preserving full history.
- This applies whether the correction originates from a doctor's own
  edit or from an AI-assisted draft being revised — the versioning rule
  is the same either way.

## AI consultation assistant — safety boundary

See `docs/workflows/doctor-consultation.md` for the full flow. The
non-negotiable rule, enforced architecturally:

> AI output (`apps/api/src/integrations/ai/ai-provider.interface.ts`,
> `DraftClinicalNote`) can only ever become a **draft**. Nothing in the
> `ai` module or the `AiProvider` port is permitted to write a
> `FINALIZED` clinical record. Only a doctor's explicit sign-off action in
> `clinical-notes` transitions a record out of draft state.

## Row-level security

`clinics`, `users`, and `patients` (every table carrying `organizationId`
in the current schema) have Postgres Row-Level Security enabled and
**forced** (`FORCE ROW LEVEL SECURITY` — plain `ENABLE` is bypassed by
the table owner role, which is typically the migration/app role, so
`FORCE` is what actually makes the policy apply to the app's own
connections). Each table's policy:

```sql
CREATE POLICY "tenant_isolation" ON "<table>"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
```

See `apps/api/prisma/migrations/20260921000000_init/migration.sql` for
the full SQL and rationale comments.

**Fails closed.** `current_setting(..., true)` returns `NULL` if the
session variable was never set, and `"organizationId" = NULL` is never
true — so a request that forgets to set tenant context sees zero rows on
these tables, not other tenants' rows. During development this usually
means "you forgot to go through `withTenant`", not a data bug.

**The app must connect as a non-superuser role, or none of this does
anything.** Postgres superusers always bypass RLS, `FORCE` included. The
official `postgres` Docker image makes `POSTGRES_USER` the cluster
superuser, so a naive setup — the app connecting as that same user —
makes RLS a complete no-op while looking correctly configured.
`infrastructure/docker/postgres-init/01-app-role.sql` creates a second,
ordinary role, `serenemed_app` (`NOSUPERUSER NOBYPASSRLS`), that the app
connects as at runtime; the schema's `directUrl` (superuser) is used only
for `prisma migrate`. This was a real, live bug in an earlier version of
this setup — caught by actually running it against Postgres with a real
non-superuser role, not by lint/typecheck/build, which all passed while
RLS was silently doing nothing. See "Verifying this" below.

**Application side**: `PrismaService.withTenant(organizationId, work)`
(`apps/api/src/prisma/prisma.service.ts`) runs `work` inside a
transaction with `app.current_organization_id` set via `set_config` (a
real bound parameter, not string-interpolated into a `SET` statement).
Every query against an RLS-protected table must go through the `tx` it
provides — RLS applies to every access path, including `findUnique`, not
just `findMany`.

**Not yet wired to a real request.** Nothing calls `withTenant` from
request-handling code yet, because nothing populates a request's
`organizationId` yet — `auth` isn't implemented (`AuthService.login` is a
stub), so there's no `req.user` to read it from. Once JWT auth lands, a
guard/interceptor reading `req.user.organizationId` should be the one
place that calls `withTenant`, wrapping each request's handler — see
`docs/architecture/open-questions.md#8`.

**Known gap**: `AuditLog` has no `organizationId` column in the current
schema, so it isn't RLS-scoped. Flagged, not fixed here — adding it is a
schema change plus a migration, not just a policy.

**Verifying this**: `pnpm --filter api run verify:tenant-isolation`
(`apps/api/scripts/verify-tenant-isolation.ts`) is a manual script — not
part of `jest`/CI — that seeds two organizations against a real Postgres
and asserts RLS actually isolates them, including that a query with no
tenant context returns zero rows and that cross-tenant `findUnique` is
blocked. Re-run it after touching RLS policies, `withTenant`, or the
docker-compose Postgres init script.

## Soft delete

Any model that must retain history — everything except `AuditLog`, which
is an immutable log and must never be deleted at all, soft or otherwise —
gets a `deletedAt DateTime?` field. That field is the entire per-model
convention: `PrismaService`'s query extension
(`apps/api/src/prisma/soft-delete.extension.ts`) discovers which models
have it from the Prisma DMMF at startup (no hardcoded model list), then:

- Excludes soft-deleted rows from `findMany` / `findFirst` / `count` by
  default. A caller that explicitly sets `deletedAt` in its own `where`
  overrides this (e.g. `{ deletedAt: { not: null } }` to list only
  deleted rows).
- **Throws** on `delete` / `deleteMany` rather than running them. To
  soft-delete a row, call `.update({ where, data: { deletedAt: new
Date() } })` directly on whatever client/transaction you already have.

That second point used to be "transparently rewrites `delete` into
`update`" — an earlier version of this extension actually did that, by
calling `.update()` through the client reference closed over in
`Prisma.defineExtension((client) => ...)`. That looked fine under
lint/typecheck/build and even worked in isolation, but it was a real
bug: that closed-over `client` is fixed to the top-level client at
extension-composition time, not to whichever transaction the surrounding
`.delete()` call was actually made through. Call `.delete()` from inside
`withTenant` (i.e. on an RLS-protected table) and the "rewritten" update
ran on a _different_, non-transactional connection with no
`app.current_organization_id` set — RLS silently rejected it, and Prisma
reported "no record found," which reads like a data bug, not the
tenant-isolation bug it actually was. Only running this against a real
Postgres with RLS actually enforced surfaced it (see "Row-level security"
above) — so now `.delete()` fails loudly and immediately instead, with an
error that says exactly what to call instead.

`findUnique` / `findUniqueOrThrow` are deliberately **not** filtered —
they're most often used for FK/relation lookups where the caller has a
specific ID and legitimately needs the row even if soft-deleted (e.g.
loading the `Clinic` referenced by an old `Appointment`). Code that needs
"only if still active" semantics on a unique lookup checks `deletedAt` on
the result itself.

**Known gap**: `@@unique([organizationId, email])` on `User` does not
account for `deletedAt` — re-inviting a soft-deleted former staff member
under the same email hits the unique constraint instead of reactivating
the row. Deliberate for now (forces an explicit restore action instead of
a surprise reactivation), documented at the constraint in
`schema.prisma`.

## Audit logging

`apps/api/src/audit` (full pattern) and the `AuditLog` Prisma model
(`prisma/schema.prisma`) capture actor, action, entity, and metadata for
security-relevant events. Per-domain audit trails with richer semantics
(e.g. clinical note amendment history) get dedicated tables as those
modules are built — `AuditLog` is the generic cross-cutting log, not a
replacement for domain-specific versioning tables.

## Other foundations already in place

- **Rate limiting**: not yet configured — flagged in `open-questions.md`.
- **Secure file access**: object storage keys are stored in Postgres as
  references, never as public URLs; access is mediated by the API
  (signed URLs / proxied download), not implemented yet but the schema
  (`S3_*` env vars) reserves the shape.
- **Consent tracking**: `patient-consent` module boundary exists; consent
  records attach to the patient, not to a specific workflow, so a single
  consent can be checked from multiple places (e.g. AI recording consent
  checked from `ai`, marketing consent checked from `crm`).
