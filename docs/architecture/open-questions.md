# Open Questions / Ambiguities

Decisions below were made to keep the architecture initialization moving
without inventing product requirements. Each needs a real answer before
the relevant module is implemented — flagged here rather than assumed
silently.

## 1. Default-deny vs. default-open authorization — RESOLVED

Went with **default-deny**: `JwtAuthGuard` is now global and runs before
`PermissionsGuard`, and every route requires a valid Bearer token unless
explicitly marked `@Public()`
(`apps/api/src/common/decorators/public.decorator.ts`) — used today by
`/health` and `/auth/login` only. Verified live: an unauthenticated
request to `GET /users` returns `401`, not a route that happened to have
no data. See `docs/architecture/security.md#authentication--staff-access-tokens-only`.

## 2. Exact role → permission matrix

`@serenemed/permissions`'s `ROLE_PERMISSIONS` table encodes a reasonable
first guess (e.g. Junior Doctor can write draft notes but not sign off;
Senior Doctor can). The real boundaries need clinical/operations
sign-off — e.g. can Reception see any clinical data at all, even
read-only, for scheduling context? **Assumption made:** conservative,
role-scoped access; expand only as each workspace's real screens need it.

## 3. Patient authentication method — email/password built, phone/OTP still open

`POST /auth/patient/login` (email/password, mirroring staff auth) is now
real and verified — see `docs/architecture/security.md#patient-authentication`.
Phone + OTP, which many Indian clinic patients may prefer over
email/password, is still not built: `Patient.passwordHash` stays
nullable specifically so it can be added later without a schema change,
but no messaging integration is wired to send a real OTP
(`integrations/messaging`'s `StubMessagingProvider` only logs — see
`docs/architecture/integrations.md`), and building a fake OTP flow on
top of it would be exactly the "generate fake integrations and pretend
they're production-ready" anti-pattern this project avoids elsewhere.
**Assumption made:** shipped the concretely-buildable half (email/
password, matching the existing staff pattern) now; left OTP for when a
real SMS/WhatsApp provider is contracted, per `integrations.md`.

Also still open: **patient self-registration**. There's no signup
endpoint — every patient account today is created by a dev seed script
(`apps/api/scripts/seed-dev.ts`), the same bootstrap-only pattern as the
first staff admin. A real "patient creates their own account" flow
(with what verification? email confirmation? staff-assisted at
registration desk, matching the OPD registration workflow in
`docs/workflows/clinic-journey.md`?) wasn't asked for here and would be
guessing at product intent to build now.

## 4. Multi-clinic / multi-organization scope for v1

The schema is tenancy-aware (`organizationId`/`clinicId` everywhere) per
the requirement, but it's unclear whether v1 launches with exactly one
organization/clinic or needs the switcher UI from day one.
**Assumption made:** data model is ready either way; no multi-org UI is
built until asked for.

## 5. Lead → Patient conversion ownership

When a `Lead` converts, which module owns creating the `Patient` row —
`crm`, `patients`, or a dedicated conversion service? **Assumption
made:** not decided yet; flagged in `docs/architecture/domain-modules.md`
rather than guessed, since getting this wrong risks the "duplicate
patient data" anti-pattern the architecture explicitly avoids.

## 6. Rate limiting strategy — RESOLVED (with real caveats)

`@nestjs/throttler` is wired: 100 req/min/IP app-wide, 5 req/min/IP on
`POST /auth/login`, verified live (5 allowed, 6th `429`) — see
`docs/architecture/security.md#rate-limiting`. One thing this doesn't
solve, tracked rather than silently assumed away:

- **Storage is now Redis-backed** (`@nest-lab/throttler-storage-redis`,
  sharing `RedisService`'s existing connection — `app.module.ts`), so
  the limit is actually shared across every instance talking to the
  same Redis, not per-instance like the original in-memory default.
  Verified live two ways: hit a route, confirmed real `{...}:hits` keys
  land in Redis via `redis-cli keys` — and, further, actually ran **two
  separate API containers** against one shared Redis and split login
  attempts across both; the 5/min limit tripped on the combined count,
  not 5-per-container (10 total) like the old in-memory default would
  have allowed — see
  `docs/architecture/deployment.md#horizontal-scaling--verified-with-real-multiple-instances`.
- **Tracked by source IP**, which assumes no reverse proxy/load balancer
  sits in front rewriting or hiding the real client IP. Still genuinely
  open — whoever introduces a proxy needs to wire `X-Forwarded-For`
  trust correctly or every client behind it shares one bucket.

## 7. Object storage provider

`.env.example` assumes an S3-compatible endpoint (works for AWS S3,
MinIO, DigitalOcean Spaces, etc.) but no specific provider was named.
**Assumption made:** kept generic via `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`
so a self-hosted MinIO in dev and a managed provider in prod both work
without code changes.

## 8. RLS tenant context isn't wired to a real request yet — RESOLVED

`JwtAuthGuard` → `TenantContextService` → `PrismaService.withTenant()` is
wired end to end and verified against real, independently-logged-in HTTP
sessions for two separate organizations (`users` module is the reference
implementation — see
`docs/architecture/security.md#row-level-security`). Two things remain
open, not resolved by this: (a) every _other_ module still needs to
follow the same `TenantContextService` + `withTenant` pattern when it's
built — nothing enforces that a future module does this correctly other
than code review; (b) the HTTP-level verification was a manual curl
session, not a committed automated test — see #10.

## 9. AuditLog has no organizationId — RESOLVED

`AuditLog.organizationId` (required, FK'd to `Organization`) landed in
`prisma/migrations/20260921070409_audit_log_organization`, with the same
`FORCE ROW LEVEL SECURITY` + fail-closed policy as `clinics`/`users`/
`patients`. `AuditService` (`apps/api/src/audit`) got a minimal real
implementation (`record()`, `listForOrganization()`) so the column isn't
just schema decoration — `GET /audit` is guarded by the pre-existing
`audit-log:read` permission. `verify-tenant-isolation.ts` now asserts
AuditLog RLS the same way it does for the other tables (fail-closed,
cross-tenant isolation).

**Follow-up closed**: `record()` sat uncalled by every other module for
a while — real infrastructure, but not wired into any actual write path,
found by checking rather than assuming it was used. Now called from
every real mutation in the clinic journey spine and `users`:
`UsersService.create` (`user.create`), `AppointmentsService.checkIn`
(`appointment.check_in`), `VitalsService.record` (`vitals.record`), and
all three `ClinicalNotesService` transitions (`clinical_note.create_draft`
/ `sign_off` / `amend`). `record()` itself was refactored to take the
caller's own `tx` instead of opening a second transaction, so the audit
entry commits or rolls back atomically with the action it's recording
— it can't succeed independently and leave the two out of sync. Verified
live: `clinic-journey.e2e-spec.ts`'s "audit trail" tests perform a real
check-in → vitals → draft → sign-off → amend sequence, then assert
`GET /audit` actually contains each entry with the correct `actorId`,
not just that the requests returned 2xx.

**Still a real decision, not fully resolved**: `organizationId` was made
_required_ on the assumption that every actor today (`User`, `Patient`)
already belongs to exactly one org, so every auditable action has one to
record. A future cross-org/platform-level admin action (e.g. a
super-admin managing multiple organizations) wouldn't fit this shape —
not designed for here, since no such actor exists yet.

## 10. No automated test covers the auth/tenant-isolation HTTP path — RESOLVED

`apps/api/test/auth-tenant.e2e-spec.ts` (`pnpm --filter api run
test:e2e`) now automates what was previously a manual curl session:
default-deny (401 unauthenticated, 401 on a garbage token, `/health`
still public), login (wrong password, right password/wrong org, and
correct credentials all 401/401/201 as expected), tenant isolation on
`GET /users` for two independently-seeded/independently-logged-in orgs,
RBAC (a `NURSE` token gets 403 on the same route), and that `POST /users`
has no field a caller could use to create a user in a different org than
their own. 11 assertions, all passing, part of the normal `test:e2e` run
now (needs a live Postgres — see the root README's local setup).

Building it surfaced two issues, both in the test itself, not the app:
an invalid test-fixture TLD (`.e2e`) that Zod's `.email()` correctly
rejected (real TLDs never contain digits), and non-idempotent seeding
that left stale rows across runs once the email fixtures changed — the
seed step now does a real `deleteMany` scoped to the test's org IDs
before creating fixtures, so repeated runs don't accumulate state.

## 11. `withTenant`'s connection pool cost — measured, threshold not decided

`docs/architecture/security.md#connection-pool-sizing` has real numbers
now (default pool size, `max_connections`, and where it actually breaks
under load), and `connection_limit`/`pool_timeout` are explicit env vars
instead of an implicit default. What's still not decided: the actual
threshold at which this deployment should introduce PgBouncer or another
pooler — that depends on real instance count and real traffic shape,
neither of which exist yet. **Assumption made:** documented the
mechanism and its real behavior so the decision is informed when it's
needed, rather than picking a threshold now with no traffic data to
justify it.

## 12. Token revocation scope: single-session only

`POST /auth/logout` (`docs/architecture/security.md#token-revocation`)
revokes exactly the token presented on that request — verified live
that a second, independent login for the same user is unaffected by
logging out the first, and, further, that the revocation is genuinely
cross-instance: logged in via one running API container, logged out via
that same container, and confirmed a second, independent container
(sharing only Redis, never receiving the logout request itself) also
rejected the token — see
`docs/architecture/deployment.md#horizontal-scaling--verified-with-real-multiple-instances`.
Two related capabilities don't exist:

- **"Log out everywhere"** — revoking every active token for a user
  (e.g. from an admin action, or a "sign out all devices" button) would
  need tracking issued `jti`s per user, not just revoked ones. The
  current design only ever writes to the blacklist, never reads "what's
  currently valid for this user."
- **Revocation on password change.** Changing a password doesn't
  invalidate existing sessions — arguably it should, but there's no
  password-change endpoint at all yet, so there was nothing to wire this
  into.

**Assumption made:** built the mechanism (per-token revocation) that was
concretely askable and verifiable now; left the two broader capabilities
above undesigned rather than guessing at a shape (per-user token
tracking? a `tokenValidAfter` timestamp on `User`? something else)
without a concrete use case driving the choice.

## 13. Clinic journey spine — a second reference implementation, before scaling to the full ERD

Before building out the ~35+ table proposed schema
(`docs/database/erd.md`), one vertical slice — `Appointment` →
`Encounter` → `Vital` → `ClinicalNote`/`ClinicalNoteVersion` — was built
end-to-end specifically to de-risk two patterns the `users`/`patients`
slice never exercised: a multi-table transaction
(`AppointmentsService.checkIn()`, one `withTenant` call doing a status
update and an `Encounter` create atomically) and append-only clinical
record versioning with DB-enforced immutability (`ClinicalNotesService`
— see `docs/architecture/security.md#clinical-record-immutability`).
Both are now live-verified, not just typechecked: automated coverage in
`apps/api/test/clinic-journey.e2e-spec.ts`, plus a manual pass that
issued a raw `UPDATE`/`DELETE` directly against `clinical_note_versions`
as the app's own Postgres role and confirmed Postgres itself — not the
app — rejects it (error 42501).

This also surfaced a real, previously-latent bug: `@UsePipes(new
ZodValidationPipe(schema))` applied at the **method** level validates
_every_ parameter, not just `@Body()`. It happened to be harmless on
every existing route (each had only a single decorated parameter), but
`ClinicalNotesController.amend()` was the first route with both a
`@Param('id')` and a `@Body()`, and the id string failed validation
against the body schema ("Expected object, received string"). Fixed by
moving every `ZodValidationPipe` from `@UsePipes(...)` on the method to
the `@Body(new ZodValidationPipe(...))` parameter decorator itself,
across all six routes that used the old pattern — not just the one that
broke — since the trap was latent in the others too and would have
resurfaced the next time someone added a second parameter to any of
them. Caught by live end-to-end testing (a real HTTP call through the
full pipe/guard stack), not by typecheck, lint, or a unit test that
mocks the framework's parameter-binding behavior.

**Partially resolved, was open as #8(a):** `verify-tenant-isolation.ts`
now includes a generic RLS _coverage_ check (`assertRlsCoverage`) — it
asks Postgres's own catalogs (`pg_class`, `pg_policies`) which tables in
`public` have an `organizationId` column, then asserts every one of
them has RLS enabled, forced, and at least one policy, instead of the
old hardcoded `patient`/`auditLog`-only checks. It needs no update when
a new table is added; it discovers the table set itself — run live after
adding `diagnoses`/`diagnosis_versions`, it found and validated all 11
real tenant-scoped tables without any change to the check itself. This
now runs automatically in CI (`.github/workflows/ci.yml`'s `db-tests`
job) on every push, not just as a manual step someone has to remember to
run. Also still open: nothing _enforces_ that a future module follows the
`TenantContextService` + `withTenant` pattern beyond code review and now
three working examples to copy from (`users`/`patients`,
`appointments`/`encounters`/`vitals`/`clinical-notes`, and
`diagnoses`). Also still open: the enum-duplication problem
(Prisma generates its own copy of every `@serenemed/types` enum) has no
generic mapper yet — this slice's services consume Prisma's own enum
types directly (`AppointmentStatus`, `EncounterStatus`,
`ClinicalRecordStatus`, `ClinicalRecordSource`) rather than
`@serenemed/types`'s copies, sidestepping the problem rather than
solving it, the same way `StaffRole` needed a hand-written mapper
(`apps/api/src/users/staff-role.mapper.ts`) instead.
