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

## 9. AuditLog has no organizationId

Every other table added a `deletedAt` field and (where relevant) an RLS
policy in this pass; `AuditLog` got neither, because it has no
`organizationId` column to scope by in the first place — and adding one
is a schema decision (should an audit log entry always belong to exactly
one org, even for cross-org admin actions?) that wasn't asked for here.
**Assumption made:** left as a known gap rather than guessed at.

## 10. No automated test covers the auth/tenant-isolation HTTP path

`apps/api/scripts/verify-tenant-isolation.ts` automates the DB-level RLS
and soft-delete checks, but the full request path (login → JWT →
`JwtAuthGuard` → `PermissionsGuard` → `TenantContextService` →
`withTenant`) was verified by hand (curl, two seeded orgs) when `users`/
`auth` were built, not by a committed Jest e2e spec. Given this exact
class of mechanism has already produced two silent bugs once (see the
Row-level security section's history), this is a real gap, not a nitpick.
**Assumption made:** left as a follow-up rather than building it now,
since it wasn't asked for — recommend a Supertest e2e spec that boots
the full `AppModule`, seeds two orgs directly via Prisma, and asserts the
same checks the manual session did.
