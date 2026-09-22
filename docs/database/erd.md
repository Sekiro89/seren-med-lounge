# Database / ERD

## What's actually in `prisma/schema.prisma` today

Two layers now. `Organization`/`Clinic`/`User`/`Patient`/`AuditLog` prove
the multi-tenant shell and the Unified Patient Record root.
`Appointment`/`Encounter`/`Vital`/`ClinicalNote`/`ClinicalNoteVersion` —
the "clinic journey spine" — is the first vertical slice built on top of
that root, chosen specifically to de-risk the two patterns nothing else
in the schema had exercised yet: a multi-table transaction (check-in) and
append-only clinical-record versioning with DB-enforced immutability. See
`docs/architecture/security.md#clinical-record-immutability`.

`Diagnosis`/`DiagnosisVersion` is the second table added to the Encounter
branch, reusing the exact same pointer + immutable-version pattern as
`ClinicalNote`/`ClinicalNoteVersion` — the schema's own top-of-file
comment already named diagnoses as expected to follow this shape, so this
isn't a new pattern, just the second real instance of it. New permission
slugs `diagnosis:write-draft`/`diagnosis:sign-off` mirror
`clinical-note:write-draft`/`clinical-note:sign-off` exactly (same
JUNIOR_DOCTOR-drafts/SENIOR_DOCTOR-signs-off split — see
`packages/permissions/src/matrix.ts`).

`Prescription`/`PrescriptionItem` is the third table, and deliberately
does **not** follow the draft/sign-off/amend pattern — the permission
matrix only ever had a single `prescription:write` slug reserved (no
sign-off counterpart), because issuing a prescription is one authorized
action, not a reviewed draft. `Prescription` itself stays a mutable
lifecycle row (`status` ACTIVE → CANCELLED, the same shape as
`Appointment.status`/`Encounter.status`), while `PrescriptionItem` — the
actual medication/dosage/frequency content — is immutable once written,
same `REVOKE UPDATE, DELETE` treatment as `ClinicalNoteVersion`/
`DiagnosisVersion`. A correction cancels the prescription and issues a
new one; nothing edits an existing item.

```
Organization ──< Clinic
Organization ──< User (staff identity — email scoped to org, StaffRole)
Organization ──< Patient (patient identity — root of the Unified Patient Record)
Organization ──< AuditLog
Clinic ──< User
Clinic ──< Patient

Patient ──< Appointment ──< Encounter ─┬─< Vital
                                        ├─< ClinicalNote ──< ClinicalNoteVersion
                                        ├─< Diagnosis ──< DiagnosisVersion
                                        └─< Prescription ──< PrescriptionItem
```

`Appointment.status` moves REQUESTED/CONFIRMED → CHECKED_IN via
`AppointmentsService.checkIn()`, which also creates the `Encounter` row —
both writes happen inside one `withTenant` transaction (sequential
awaits, not `Promise.all`; see the comment on `checkIn()` for why a
single interactive-transaction connection can't safely run concurrent
queries). `ClinicalNote` is a mutable "thread" pointer (current status +
latest version number); every actual state — DRAFT, FINALIZED, an
AMENDED correction — is a new `ClinicalNoteVersion` row, and the
database itself (not just the app) refuses to UPDATE or DELETE one: see
`REVOKE UPDATE, DELETE ON "clinical_note_versions" FROM serenemed_app;`
in `prisma/migrations/20260921090000_clinic_journey_spine/migration.sql`.
Verified live, at the SQL level, that a raw `UPDATE`/`DELETE` against
`clinical_note_versions` as `serenemed_app` fails with Postgres error
42501 (permission denied) — this holds even if a future bug in the
application code tried to bypass the extension-level guard, because the
privilege to write isn't there at all.

`User.email` and `Patient.email` are each unique per `(organizationId,
email)`, not globally — the same person can hold separate staff accounts
(or, distinctly, a separate patient record) at two organizations under
one email, which matters once multi-org is real. `Patient.email`'s
constraint is nullable-safe (Postgres doesn't treat `NULL`s as equal),
since not every patient has an email on file. `clinicId` is indexed on
both `User` and `Patient` for clinic-scoped lookups (e.g. "patients at
this clinic"), not just `organizationId`.

`User` (staff) and `Patient` are separate tables on purpose — see
`docs/architecture/domain-modules.md`. Nothing else is duplicated: every
future table below attaches to `Patient.id`, never to a copy of patient
fields.

`Organization`, `Clinic`, `User`, `Patient`, `Appointment`, `Encounter`,
`Vital`, `ClinicalNote`, `Diagnosis`, and `Prescription` all carry
`deletedAt` and go through the soft-delete convention (nothing is
hard-deleted). All of those plus `AuditLog`, `ClinicalNoteVersion`,
`DiagnosisVersion`, and `PrescriptionItem` have a Postgres RLS policy
enforcing tenant isolation at the database. `AuditLog`,
`ClinicalNoteVersion`, `DiagnosisVersion`, and `PrescriptionItem` are all
exceptions to the soft-delete convention (none has a `deletedAt`) but not
to RLS — an audit trail and a finalized clinical record must never be
deletable, soft or otherwise — see
`docs/architecture/security.md#soft-delete` and `#row-level-security`.

## Proposed full ERD (not yet implemented — added table-by-table per module)

```
Organization, Clinic, User, Role, Permission
        │
        ▼
Patient ─┬─ PatientDocument
         ├─ PatientConsent
         │
         ├─ Lead ── Campaign, LeadActivity          (pre-conversion; see marketing-funnel.md)
         │
         ├─ Appointment ─┬─ QueueEntry
         │                ├─ Registration
         │                └─ Encounter ─┬─ Vital                        (implemented — see above)
         │                              ├─ MedicalHistory
         │                              ├─ ClinicalNote ── ClinicalNoteVersion  (implemented — see above)
         │                              ├─ LabOrder ─┬─ LabOrderItem
         │                              │            └─ LabResult
         │                              ├─ Referral
         │                              └─ Procedure ── Surgery
         │
         ├─ Invoice ── InvoiceItem
         │      ├─ Payment ── Refund
         │      └─ InsuranceCase ── InsuranceClaim
         │
         ├─ Dispensing ── (Medication, InventoryItem, StockMovement)
         │
         └─ CarePlan ── FollowUp
```

`Appointment`, `Encounter`, `Diagnosis`, and now `Prescription`/
`PrescriptionItem` are also implemented (see above) — `QueueEntry`,
`Registration`, `MedicalHistory`, `LabOrder`/`LabOrderItem`/`LabResult`,
`Referral`, and `Procedure`/`Surgery` remain proposed.

Cross-cutting, not attached to a single patient:

```
Medication, InventoryItem, StockMovement   (pharmacy/inventory catalogue)
Notification                                (per-recipient, references any entity)
AuditLog                                    (already implemented — generic)
```

## Key relationships and why

- **Patient is the single root.** Appointment, Encounter, and everything
  clinical/billing/pharmacy/follow-up hangs off `patientId`. No module
  gets its own copy of name/DOB/contact fields.
- **Clinical record versioning (implemented for ClinicalNote and
  Diagnosis).** `ClinicalNote`/`Diagnosis` each hold a current pointer;
  their respective Version tables hold full history, one row per state
  transition, DB-enforced append-only. Procedure notes (not yet modeled)
  are expected to follow the same draft → reviewed → finalized → amended
  shape when built. **Prescription deliberately does not** — it has no
  sign-off step (only a single `prescription:write` permission exists),
  so it's a mutable status pointer (ACTIVE/CANCELLED) plus immutable
  `PrescriptionItem` rows, not a full version history — see
  `docs/architecture/security.md#clinical-record-immutability`.
- **Lead vs. Patient.** `Lead` exists only pre-conversion. Converting a
  lead creates exactly one `Patient` and links back to the originating
  `Lead` for attribution — it does not become a parallel patient record.
- **Tenancy.** Every model carries `organizationId` (and `clinicId` where
  it makes sense) from the start, per `docs/architecture/open-questions.md#4`.

## Adding a table

1. Add the model to `prisma/schema.prisma` inside the domain module
   that owns it (comment-group them, as the current file does).
2. Run `pnpm --filter api run prisma:migrate -- --name <description>`.
3. Update this file's proposed-ERD section to move the table from
   "proposed" to "implemented" (i.e. delete it from the diagram above
   once it exists in the schema, to keep this doc from drifting).
