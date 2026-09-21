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

## 3. Patient authentication method

`Patient.passwordHash` in `prisma/schema.prisma` assumes email/password
auth, but many Indian clinic patients may prefer phone + OTP. **Assumption
made:** schema allows either (phone is required, email/password are
optional) so OTP-based auth can be added without a schema change, but the
actual auth flow is not implemented.

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

## 6. Rate limiting strategy

Section 21 (Security) calls for rate limiting; no specific limits or
scope (per-IP? per-account? per-endpoint class?) were given.
**Assumption made:** deferred entirely — not configured yet. Recommend
`@nestjs/throttler` with per-route overrides when auth lands, since
sensible limits depend on knowing which endpoints are public.

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
implementation (`record()`, `listForOrganization()`, both via
`withTenant`) so the column isn't just schema decoration — `GET /audit`
is guarded by the pre-existing `audit-log:read` permission.
`verify-tenant-isolation.ts` now asserts AuditLog RLS the same way it
does for the other tables (fail-closed, cross-tenant isolation).

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
