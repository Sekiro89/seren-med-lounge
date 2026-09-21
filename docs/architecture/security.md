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
- **Every route is throttled, and login is throttled harder.** See "Rate
  limiting" below — `POST /auth/login` is the one public endpoint that
  checks a password, and 5/min/IP is deliberately tighter than the
  100/min app-wide default.
- **A stolen token doesn't have to stay valid until it expires.** See
  "Token revocation" below — logout actually revokes the presented
  token, not just a client-side "forget the token and hope."

## Authentication — staff, access tokens only

`POST /auth/login` (`apps/api/src/auth`) is real and verified end-to-end
against a live server (curl, not just typecheck — see "Verifying this"
under Row-level security). What exists:

- Passwords hashed with bcrypt (cost 12), never stored or logged
  plaintext.
- `AuthService.login({ organizationId, email, password })` looks up the
  user scoped to that organization (via `UsersService`, which itself goes
  through `withTenant` — see Row-level security), compares the password
  hash, and — on success — signs a JWT (`{ sub, organizationId, role }`)
  with `JWT_SECRET`/`JWT_ACCESS_TTL`. The same `UnauthorizedException` is
  thrown for "no such user" and "wrong password" so a caller can't
  enumerate valid emails per organization.
- `JwtAuthGuard` (`apps/api/src/common/guards/jwt-auth.guard.ts`) is
  registered globally, before `PermissionsGuard`, and is **default-deny**:
  every route requires a valid Bearer token unless decorated `@Public()`
  (`apps/api/src/common/decorators/public.decorator.ts`) — used today
  only by `/health` and `/auth/login`. This resolves what was open
  question #1; see `docs/architecture/open-questions.md`.
- Patient auth and staff auth are separate credential stores (`Patient`
  vs. `User` in `prisma/schema.prisma`) — a patient is never granted a
  staff role by sharing a table. Both now exist — see "Patient
  authentication" below for how they differ.

**Requires `organizationId` in the login request** — a documented
assumption (`loginSchema`'s comment in `@serenemed/validation`), not a
resolved UX: `User.email` is unique per `(organizationId, email)`, so
something has to say which org before a lookup can happen, and there's
no product decision yet on how a real UI resolves that (subdomain, org
picker, email-domain lookup). The patient login page (`apps/patient-web/app/login`)
surfaces this honestly as a plain "Clinic ID" text field rather than
hiding the gap behind a nicer-looking UI.

**Not implemented**: refresh tokens (`JWT_REFRESH_TTL` is reserved for
this — access tokens only today, so a client must re-login every
`JWT_ACCESS_TTL`), and any staff signup/invite flow (`POST /users`
exists but requires an already-authenticated `user:manage` caller — see
`apps/api/scripts/seed-dev.ts` for how the _first_ user in a fresh
database gets created, which is a dev-only bootstrap script, not a
production flow).

## Patient authentication

`POST /auth/patient/login` + `GET /patients/me` + `POST /auth/patient/logout`
(`apps/api/src/auth/patient-auth.service.ts`, `apps/api/src/patients`) —
same login shape as staff (`organizationId` + `email` + `password`,
same rate limit, same bcrypt/JWT/revocation mechanics), but a genuinely
different authorization model, not just a different table:

- **One shared JWT shape, not two token formats.** `JwtPayload`/
  `AuthenticatedUser` (`apps/api/src/auth/jwt-payload.interface.ts`) are
  discriminated unions on `actorType: 'USER' | 'PATIENT'` — narrowing on
  it gives TypeScript the real role type (`StaffRole` vs `PatientRole`),
  which is what lets `PermissionsGuard` call `roleHasPermission(user.role,
...)` without a cast once `actorType !== 'USER'` is ruled out.
- **`PermissionsGuard` rejects any patient actor outright** on a
  `@RequirePermissions(...)` route, before even calling
  `roleHasPermission` — `ROLE_PERMISSIONS` (`@serenemed/permissions`)
  only has entries for `StaffRole`; there's no "patient permission" to
  check. Verified live (and in `test/patient-auth.e2e-spec.ts`): a
  patient token on `GET /users` gets `403`.
- **A patient isn't authorized by RBAC at all — by record ownership.**
  `GET /patients/me` isn't `@RequirePermissions`-gated; it checks
  `request.user.actorType === 'PATIENT'` directly in the controller and
  always looks up the JWT's own `sub`, never a client-supplied ID — so
  there's no parameter to manipulate into requesting a different
  patient's record (no IDOR surface by construction, not by validation).
  Verified live: a staff token gets `403` on this route too — RBAC
  permissions and patient ownership are two separate, non-overlapping
  checks, and neither actor type can use the other's authorization path.
- **`PatientAuthService` lives in the `auth` module, not `patients`.**
  It needs `JwtService`/`TokenBlacklistService`, which `auth` owns;
  putting it in `patients` instead would make `patients` depend on
  `auth` for JWT infrastructure while `auth` depends on `patients` for
  the controller route — a circular module dependency avoided by keeping
  the direction one-way (`auth` imports `patients` for `PatientsService`,
  not the reverse).
- `Patient.email` now has the same `@@unique([organizationId, email])`
  constraint as `User.email` (nullable-safe — Postgres doesn't treat
  `NULL`s as equal, so many patients with no email yet is fine), added
  in `prisma/migrations/20260921080000_patient_email_unique`.

**Not implemented**: patient self-registration/signup (there's no way
for a new patient to create their own account — `seed-dev.ts` creates
one dev patient, same bootstrap-only caveat as the staff admin), phone/OTP
login (`Patient.passwordHash` is nullable specifically so this can be
added without a schema change — see `open-questions.md#3` — but no
messaging integration is wired to send a real OTP, and building a fake
one would violate the "no fake integrations" rule this project holds
elsewhere).

**Verified**: live against a running server (login, `/me`, both
directions of the actor-type boundary, logout) with real HTTP requests,
including the actual CORS preflight + POST pattern a browser would send
from `patient-web`'s origin — not just curl without an `Origin` header.
Also covered by `test/patient-auth.e2e-spec.ts` (6 tests). **Not**
verified in an actual browser — no browser/UI-automation tool was
available in the session that built this; `pnpm dev:patient` +
`pnpm dev:api` and trying the form by hand is the recommended next
check before trusting the click-through experience itself (form
validation UX, error message rendering, etc.) — typecheck/build passing
confirms the code is correct, not that it feels right to use.

## Token revocation

A stolen or leaked JWT was previously valid until it naturally expired
(15 minutes by default) with no way to invalidate it sooner. Fixed with
a Redis-backed blacklist:

- Every token gets a unique `jti` claim at signing time (`AuthService.login`,
  `crypto.randomUUID()`).
- `POST /auth/logout` (authenticated — needs `JwtAuthGuard` to have
  already verified the token and populated `request.user.jti`/`expiresAt`)
  writes `auth:revoked-jti:<jti>` to Redis via `TokenBlacklistService`
  (`apps/api/src/auth/token-blacklist.service.ts`), with a TTL equal to
  the token's own remaining lifetime — verified: a token revoked ~6
  seconds after a 15-minute login showed a Redis TTL of 894s. Entries
  expire on their own; nothing accumulates forever.
- `JwtAuthGuard` checks the blacklist (only after signature/expiry
  verification already passed — no point spending a Redis round-trip on
  a token that's invalid anyway) and rejects with `401 Token has been
revoked.` if present.

`TokenBlacklistService` is intentionally separate from `AuthService` —
`JwtAuthGuard` needs it on every request and shouldn't drag in
`AuthService`'s full dependency graph (`UsersService`, `bcrypt`, login
logic) just to check a Redis key.

**Scope, verified live**: logging out one token doesn't affect a
different token for the same user (two independent logins, revoke one,
the other still works) — real concurrent-session behavior, not assumed.
Logging back in after a logout issues a fresh, valid token — revocation
isn't a lockout.

**Not implemented**: "log out everywhere" (revoke all of a user's active
tokens at once — would need tracking issued `jti`s per user, not just
revoked ones) and revocation on password change (a changed password
should probably invalidate existing sessions; doesn't yet, since there's
no password-change endpoint at all yet).

## Rate limiting

Every route had zero throttling — open question #6 from the start of
this project, and the single most concrete gap: nothing stopped
unlimited password-guessing against `POST /auth/login`. Fixed with
`@nestjs/throttler`:

- App-wide default: 100 requests/minute per IP (`ThrottlerModule.forRoot`
  in `app.module.ts`), enforced by a global `ThrottlerGuard` — registered
  _before_ `JwtAuthGuard` so abusive traffic is rejected before spending
  any work on JWT verification or a Redis blacklist lookup.
- `POST /auth/login` overrides this with `@Throttle({ default: { limit:
5, ttl: 60_000 } })` — 5 attempts/minute per IP. Verified live against a
  clean server: attempts 1–5 returned `401` (wrong password), attempt 6
  returned `429`.
- Storage is Redis-backed (`@nest-lab/throttler-storage-redis`, sharing
  `RedisService`'s existing connection rather than opening a second one
  — `ThrottlerModule.forRootAsync` in `app.module.ts`), so the limit is
  shared across every instance talking to the same Redis, not
  per-instance like the original in-memory default. Verified live: hit
  a route, then confirmed real `{...}:hits` keys actually landed in
  Redis via `redis-cli keys`, not just that the request itself
  succeeded.
- Disabled under `NODE_ENV=test` (`skipIf` in the module config, matching
  the value Jest sets automatically) — the e2e suite logs in more times
  than the real 5/min limit allows, and failing those tests on a
  rate-limit hit would test the throttle's existence, not what the tests
  are actually about. The real limit is unchanged everywhere else.

**Tracked by source IP.** Behind a reverse proxy/load balancer that
doesn't forward/trust `X-Forwarded-For` correctly, every request could
appear to come from the proxy's own IP, making the limit either
uselessly shared across all real clients or (if trusted blindly)
spoofable by a client setting that header itself. Not an issue on a
single instance with no proxy in front, which is the current setup;
flagged for whenever a proxy is introduced.

## CORS

`apps/api/src/main.ts` never called `app.enableCors()` — browsers would
have blocked `patient-web`/`staff-web` (different ports, so different
origins) from calling the API at all. Fixed:

- `app.enableCors({ origin: <CORS_ORIGINS, split on comma>, credentials:
true, allowedHeaders: ['Content-Type', 'Authorization'] })`, applied
  before routes are registered.
- `CORS_ORIGINS` env var (`.env.example`), defaulting to the two local
  frontend dev ports (`http://localhost:3000,http://localhost:3001`) —
  **must** be set to the real deployed frontend origin(s) in any other
  environment, or the frontends can't call the API from a browser at
  all (this is CORS blocking it client-side, not a server error — the
  API logs would show nothing wrong).
- Verified live: a request with `Origin: http://localhost:3000` gets
  `Access-Control-Allow-Origin: http://localhost:3000` back; a request
  with `Origin: http://evil.com` gets no such header (browsers refuse to
  expose the response to that origin's JS).

## Security headers

No `Helmet` (or equivalent) — no CSP, no HSTS, no `X-Frame-Options` on
any response. Fixed: `app.use(helmet(...))` in `main.ts`, applied first,
before CORS and routes. Verified live — `curl -D -` on `/health` shows
`Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`
present on every response.

**CSP had to be relaxed for Swagger UI specifically** — its bundled page
uses inline `<script>`/`<style>`, which Helmet's default CSP blocks.
`script-src`/`style-src` were widened to include `'unsafe-inline'`
(everything else keeps Helmet's default directives) rather than
disabling CSP app-wide for one page's sake. Verified `/docs` still
returns `200` and renders the expected Swagger UI HTML with this in
place.

## Clinical record immutability

Finalized clinical records (clinical notes today; diagnoses,
prescriptions, procedure notes, and reports are proposed but not yet
modeled — see `docs/database/erd.md`) are **never updated in place**.
Implemented for `ClinicalNote` as part of the clinic-journey-spine slice.
The lifecycle is:

```
Draft → (AI Draft, if AI-assisted) → Reviewed → Finalized → Amendment → new Version
```

`ClinicalNote` is a mutable "thread" pointer (current `status` +
`currentVersionNumber`); every actual state is a new
`ClinicalNoteVersion` row, inserted, never updated — see
`ClinicalNotesService` (`createDraft`/`signOff`/`amend`, plus the private
`requireLatestVersion` helper all three build on).

This is enforced at **two independent layers**, not just app-level
convention:

1. **App layer.** `ClinicalNotesService` only ever calls
   `clinicalNoteVersion.create(...)` — there is no method that updates or
   deletes a version. The Prisma soft-delete extension
   (`soft-delete.extension.ts`) also throws if any future code calls
   `.delete()`/`.deleteMany()` on any soft-deletable model, though
   `ClinicalNoteVersion` isn't one (it has no `deletedAt` — see below).
2. **Database layer, independent of the app.** The migration that adds
   these tables
   (`prisma/migrations/20260921090000_clinic_journey_spine/migration.sql`)
   includes `REVOKE UPDATE, DELETE ON "clinical_note_versions" FROM
serenemed_app;` — the app's own Postgres role has no privilege to
   write to that table at all, once a row exists. Verified live: a raw
   `UPDATE`/`DELETE` against `clinical_note_versions`, issued directly
   through Prisma (bypassing the app's own guard entirely), fails with
   Postgres error 42501 (`permission denied for table
clinical_note_versions`). A future bug in application code — even one
   that reintroduces a `.update()` call on a version row — cannot
   silently corrupt history; the database itself refuses the write.

`ClinicalNoteVersion` has no `deletedAt` field, the same exception as
`AuditLog` (see `#soft-delete` below) — an append-only clinical record,
like an audit trail, must never be deletable, soft or otherwise. Unlike
`AuditLog`, it goes one step further: `AuditLog` still permits `INSERT`
and read from the app role indefinitely (append-only by convention),
while `ClinicalNoteVersion` additionally has `UPDATE`/`DELETE` privilege
actively revoked (append-only by database grant).

- A finalized record is closed for writes. Correcting it creates a new
  version linked to the original, preserving full history — verified via
  `apps/api/test/clinic-journey.e2e-spec.ts`, which checks that version 1
  (the original draft) is still readable, unchanged, after two further
  amendments have run.
- This applies whether the correction originates from a doctor's own
  edit or from an AI-assisted draft being revised — the versioning rule
  is the same either way. (The AI-assisted path itself is not yet built —
  see the next section.)

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

**Wired to real requests, reference implementation in `users`.**
`TenantContextService` (`apps/api/src/prisma/tenant-context.service.ts`,
request-scoped) reads `request.user.organizationId` — populated by
`JwtAuthGuard` — and `UsersController`/`UsersService` show the intended
pattern: a controller calls
`usersService.listForOrganization(tenantContext.organizationId)`, and the
service wraps its query in `prisma.withTenant(organizationId, tx => ...)`.
Every new module doing tenant-scoped reads/writes should follow this
same shape. Verified against real, independently-logged-in HTTP sessions
for two different organizations — see "Verifying this" below.

Being request-scoped, `TenantContextService` forces anything that
injects it (so far: `UsersController`) to become request-scoped too,
which is a real, accepted perf cost (no longer a singleton) — worth
watching as more modules adopt the pattern; not a problem yet at this
scale.

`AuditLog` is RLS-scoped the same way as the rest — `organizationId` was
added in a follow-up migration (`20260921070409_audit_log_organization`)
after the table already existed. See
`docs/architecture/open-questions.md#9` for what's still a genuine
open decision (required vs. optional `organizationId`) rather than a gap.

**Verifying this**: two committed, automated checks — `pnpm --filter api
run verify:tenant-isolation` (`apps/api/scripts/verify-tenant-isolation.ts`)
exercises `PrismaService` directly against a real Postgres, and `pnpm
--filter api run test:e2e` includes `test/auth-tenant.e2e-spec.ts`,
which drives the full HTTP path — login, `JwtAuthGuard`,
`PermissionsGuard`, `TenantContextService`, `withTenant` — for two
independently-seeded, independently-logged-in organizations, plus
default-deny and RBAC checks on the same routes. Both need a live
Postgres (see the root README). Re-run both after touching
`JwtAuthGuard`, `TenantContextService`, the RLS policies, or the guard
registration order in `app.module.ts`.

## Connection pool sizing

Every tenant-scoped query opens a transaction (`withTenant`'s `BEGIN` →
`set_config` → query → `COMMIT`), which holds a Postgres connection for
longer than a plain query would. This is a real cost of the RLS design,
not a hypothetical one — measured, not just reasoned about:

- Prisma's default pool size is `num_cpus * 2 + 1` — **17** on the
  8-core machine this was measured on. Confirmed via `pg_stat_activity`:
  the app held exactly 17 `serenemed_app` connections after a burst of
  200 concurrent `GET /users` requests, and never exceeded it.
- The docker-compose Postgres's default `max_connections` is **100**.
  17 per instance means roughly 5 API instances (100 / 17, minus
  headroom for migrations/psql/monitoring) before instances start
  fighting over connections — with zero code changes, just from
  scaling out replicas.
- That default pool size is a real footgun in containers: `num_cpus`
  often reflects the **host's** core count, not a container's CPU
  _limit_, so it can silently size a pool much larger than intended.

**Fix applied**: `DATABASE_URL` now sets `connection_limit` and
`pool_timeout` explicitly (`.env.example`) instead of relying on
Prisma's default — a deliberate, visible number instead of an implicit
one. `connection_limit=10` was verified to actually take effect (same
`pg_stat_activity` check, capped at exactly 10).

**How it behaves under load** — measured against a live server, not
assumed:

| Pool size    | Timeout       | Concurrent requests | Result                          |
| ------------ | ------------- | ------------------- | ------------------------------- |
| 17 (default) | 10s (default) | 200                 | all `200`, 178ms total          |
| 10           | 10s           | 200                 | all `200`, 207ms total          |
| 2            | 2s            | 100                 | all `200`, 123ms total          |
| 2            | 2s            | 2,000               | all `200`, ~2s total            |
| 2            | 2s            | 5,000               | **1,044 / 5,000 failed** (~21%) |

Excess requests **queue** for a free connection rather than failing
immediately — confirmed by the 2-connection pool handling 2,000
concurrent requests without a single error. It only actually breaks once
genuinely overloaded: at 5,000 requests against a 2-connection pool, the
failures were real `PrismaClientKnownRequestError`s — "Timed out
fetching a new connection from the connection pool" — not a hang, a
crash, or (this being the thing that actually mattered to check) not a
mysterious RLS-shaped failure. NestJS's default exception filter turns
that into a `500`; giving it a friendlier `503`/`Retry-After` response
would be a reasonable follow-up, not done here.

**Not tested here**: PgBouncer. Prisma's own guidance is that
transaction-mode pooling is compatible with this app's pattern
specifically because `set_config(...)` and the query it scopes always
run inside one `$transaction()` — i.e. one logical transaction, which is
exactly PgBouncer transaction-mode's unit of connection reuse — but it
requires adding `?pgbouncer=true` to `DATABASE_URL` to disable prepared-statement
caching behavior that doesn't work with connection multiplexing. That's
documented Prisma behavior, not something exercised against a real
PgBouncer in this session — flag it as unverified if it matters before
relying on it.

**When this actually needs attention**: multiple API instances against
one Postgres (the 100-connection ceiling divided among them), or
individual `withTenant` callbacks doing slow work (a slow query, a slow
external call inside the transaction) rather than the fast single
`SELECT`s measured here. Neither is true yet — this documents real
numbers so the next person doesn't have to re-derive them from scratch
when it does become true.

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

`apps/api/src/audit` and the `AuditLog` Prisma model (`prisma/schema.prisma`)
capture actor, action, entity, organization, and metadata for
security-relevant events. `AuditService.record()`/`listForOrganization()`
go through `withTenant` like every other tenant-scoped write/read — see
Row-level security above. Per-domain audit trails with richer semantics
(e.g. clinical note amendment history) get dedicated tables as those
modules are built — `AuditLog` is the generic cross-cutting log, not a
replacement for domain-specific versioning tables. Nothing calls
`AuditService.record()` yet — no other module has a real mutation worth
auditing (only `users` does real writes so far, and wasn't asked to call
this) — so `GET /audit` returns an empty list until something does.

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
