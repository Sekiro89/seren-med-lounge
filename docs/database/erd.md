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

`LabOrder`/`LabOrderItem`/`LabResult` is the fourth table of that chunk,
same `Prescription`-style shape (`LabOrder.status` ORDERED/CANCELLED is
mutable; `LabOrderItem` — the ordered test — is immutable), plus one
more piece: `LabResult` is a separate immutable table referencing
`LabOrderItem`, not `LabOrder` directly (unlike the loose sketch in the
proposed section below) — a result belongs to one specific ordered
test, and an order can have several. `lab-order:write` (ordering) and
`lab-result:write` (recording a result) are two separate permissions —
the latter was `ADMINISTRATOR`-only until the `LAB_TECHNICIAN`
`StaffRole` was added (`prisma/migrations/20260922040000_lab_technician_role`),
closing the gap rather than guessing a role into `ADMINISTRATOR`'s
permission earlier. `LAB_TECHNICIAN` deliberately doesn't get
`lab-order:write` — ordering stays a doctor's decision.

`PatientDocument`/`PatientConsent` are the fifth and sixth tables, the
two missing items on the Unified Patient Record's own tab list (Profile,
Visits & vitals, Diagnoses & prescriptions were already covered). They
attach directly to `Patient`, not `Encounter` — a document or a consent
isn't scoped to one visit. `PatientDocument` records file _metadata_
only (`storageKey` assumes a future upload flow already placed the file
in object storage — see its doc comment for why no upload client was
built) and is an ordinary soft-deletable table, since a document can
legitimately need replacing. `PatientConsent` is the opposite: fully
immutable and append-only (same `REVOKE UPDATE, DELETE` treatment as the
clinical-content tables), because a consent record is exactly the kind
of thing that must never be silently edited — "is the patient currently
consented for X" is derived from the latest row per
`(patientId, consentType)`, not stored as a separate mutable pointer.

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
                                        ├─< Prescription ──< PrescriptionItem
                                        └─< LabOrder ──< LabOrderItem ──< LabResult

Patient ──< PatientDocument
Patient ──< PatientConsent
Patient ──< Invoice ──┬─< InvoiceItem
          (Encounter?)└─< Payment ──< Refund
```

`Invoice`/`InvoiceItem`/`Payment`/`Refund` are the billing chunk. `Invoice`
attaches to `Patient` (and optionally the `Encounter` it bills for);
`status`/`paidMinor` are its mutable lifecycle, while items, payments and
refunds are append-only (`REVOKE UPDATE, DELETE`). Amounts are integer
paise with CHECK constraints at the database level — see
`docs/architecture/security.md#billing--immutable-money-records-db-checked-amounts`.

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
`Vital`, `ClinicalNote`, `Diagnosis`, `Prescription`, `LabOrder`, and
`PatientDocument` all carry `deletedAt` and go through the soft-delete
convention (nothing is hard-deleted). All of those plus `AuditLog`,
`ClinicalNoteVersion`, `DiagnosisVersion`, `PrescriptionItem`,
`LabOrderItem`, `LabResult`, and `PatientConsent` have a Postgres RLS
policy enforcing tenant isolation at the database. `AuditLog`,
`ClinicalNoteVersion`, `DiagnosisVersion`, `PrescriptionItem`,
`LabOrderItem`, `LabResult`, and `PatientConsent` are all exceptions to
the soft-delete convention (none has a `deletedAt`) but not to RLS — an
audit trail and a finalized clinical record must never be deletable,
soft or otherwise — see `docs/architecture/security.md#soft-delete` and
`#row-level-security`.

## The October 2026 backend build — every proposed table now exists

53 models. Added on top of the diagram above (all organizationId-scoped,
all RLS-protected — `verify:tenant-isolation` discovers them
automatically):

```
Encounter ─┬─ Registration (1:1)          visit type, route A/B, ID proof, cancer-check flag
           ├─ QueueEntry (1:1)            daily token per org, station + status
           ├─ MetabolicWorkup             point-of-care glucose/HbA1c/lipids/body composition
           ├─ Referral                    INTERNAL (to a doctor) / EXTERNAL
           ├─ Procedure ──< ProcedureChecklistItem      kind PROCEDURE | SURGERY
           │      └─ ClinicalNote (noteType OPERATIVE / DISCHARGE_SUMMARY, procedureId)
           └─ CarePlan ──< FollowUp ── Appointment (review visit, 1:1)

Patient ─┬─ MedicalHistoryEntry          allergies, conditions, past surgery, meds, family/social
         ├─ Dispensing ── PrescriptionItem, Medication ──< StockMovement >── StockBatch
         ├─ InsurancePolicy ──< InsuranceCase ──< InsuranceCaseEvent   (case → Invoice → Payment INSURANCE)
         ├─ ReviewRequest ── Review
         ├─ MessageThread ──< Message
         └─ Lead (convertedPatientId / referredByPatientId) ── Campaign, LeadActivity

ClinicalTemplate ──< ClinicalTemplateVersion ──< ClinicalNote.templateVersionId
User ──< DoctorAvailability, StaffTask, Notification (user | role | patient recipient)
Appointment.doctorId → User                       (doctor's daily calendar)
```

Append-only at the database (`REVOKE UPDATE, DELETE`): `invoice_items`,
`payments`, `refunds`, `stock_movements`, `lead_activities`,
`insurance_case_events`, `clinical_template_versions`; `messages` allows
UPDATE only on its two read-stamp columns. CHECK constraints guard money
(non-negative, line totals, `paidMinor <= totalMinor`), stock
(`quantityOnHand >= 0`, movement sign by type), referral targets,
procedure scheduling, review rating/video key, availability times,
one-recipient notifications and message senders.

Still not modelled: AI consultation recordings/transcripts (provider not
chosen), online payment intents/webhooks (gateway not contracted),
integration sync/outbox for Zoho/labs, and DB-backed Role/Permission
tables (the matrix stays in `@serenemed/permissions`).

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
- **Consent is append-only, documents are not.** `PatientConsent` gets
  the same DB-level immutability as clinical content (a consent record
  must never be silently edited); `PatientDocument` is ordinary
  soft-delete, since a document can legitimately need replacing. Both
  attach to `Patient` directly, not to a specific `Encounter`.
- **Tenancy.** Every model carries `organizationId` (and `clinicId` where
  it makes sense) from the start, per `docs/architecture/open-questions.md#4`.

## Adding a table

1. Add the model to `prisma/schema.prisma` inside the domain module
   that owns it (comment-group them, as the current file does).
2. Run `pnpm --filter api run prisma:migrate -- --name <description>`.
3. Update this file's proposed-ERD section to move the table from
   "proposed" to "implemented" (i.e. delete it from the diagram above
   once it exists in the schema, to keep this doc from drifting).
