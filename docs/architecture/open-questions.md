# Open Questions / Ambiguities

Decisions below were made to keep the architecture initialization moving
without inventing product requirements. Each needs a real answer before
the relevant module is implemented — flagged here rather than assumed
silently.

## 1. Default-deny vs. default-open authorization

`PermissionsGuard` is registered globally, but a route with no
`@RequirePermissions(...)` decorator currently **passes through**
(open). This is safe only as an interim state because no route yet reads
`req.user` (auth isn't wired). Once JWT auth lands, decide: should
undecorated routes become **default-deny** (explicit `@Public()` opt-out
per route), or stay default-open (explicit `@RequirePermissions`
opt-in)? Default-deny is the safer default for a healthcare system.
**Assumption made:** left default-open for now since flipping it is a
one-line change in `PermissionsGuard`, but it must be revisited before
any real route ships.

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
