# Database / ERD

## What's actually in `prisma/schema.prisma` today

Deliberately minimal — see the file header. It proves the multi-tenant
shell and the Unified Patient Record root, nothing more:

```
Organization ──< Clinic
Organization ──< User (staff identity — email/password, StaffRole)
Organization ──< Patient (patient identity — root of the Unified Patient Record)
Clinic ──< User
Clinic ──< Patient
AuditLog (generic cross-cutting log; not tied to a specific entity by FK)
```

`User` (staff) and `Patient` are separate tables on purpose — see
`docs/architecture/domain-modules.md`. Nothing else is duplicated: every
future table below attaches to `Patient.id`, never to a copy of patient
fields.

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
         │                └─ Encounter ─┬─ Vital
         │                              ├─ MedicalHistory
         │                              ├─ Diagnosis
         │                              ├─ ClinicalNote ── ClinicalNoteVersion
         │                              ├─ Prescription ── PrescriptionItem
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
- **Clinical record versioning.** `ClinicalNote` holds the current
  pointer; `ClinicalNoteVersion` (not yet modeled) holds full history.
  Diagnoses, prescriptions, and procedure notes follow the same
  draft → reviewed → finalized → amended shape — see
  `docs/architecture/security.md`.
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
