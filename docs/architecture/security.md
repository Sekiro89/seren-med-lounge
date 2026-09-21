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
