# Marketing Funnel

```
LEAD → CRM → EDUCATION → NURTURE → APPOINTMENT → PATIENT → RETENTION → REFERRAL
```

Marketing exists **before** a person is a patient. It is connected to the
Unified Patient Record, not a disconnected database — a `Lead` that
converts becomes exactly one `Patient` (see
`docs/architecture/domain-modules.md#patients-vs-crm-leads`).

## Domain modules involved

`leads`, `crm`, `marketing`, `campaigns` (see `docs/architecture/domain-modules.md`).

## Lead data

- **Source**: `WEBSITE | SOCIAL_MEDIA | CAMPAIGN | REFERRAL | CAMP | WALK_IN`
  (`LeadSource` in `@serenemed/types`)
- **Enquiry**: free-text/structured detail of what was asked
- **Lead owner**: the staff user (`MARKETING` role, typically) responsible
- **Consent**: whether the lead can be contacted, and how — attaches to
  the same consent model the patient record uses once converted
- **Status**: `NEW | CONTACTED | NURTURING | APPOINTMENT_BOOKED | CONVERTED | LOST`
  (`LeadStatus` in `@serenemed/types`)
- **Campaign**: which campaign (if any) generated the lead
- **Follow-up / nurture history**: timestamped touchpoints

## Conversion point

A lead converts to a patient the moment an appointment is actually
booked and attended (not merely requested) — the exact trigger point is
flagged as an open question in
`docs/architecture/open-questions.md#5-lead--patient-conversion-ownership`
pending product sign-off on which module owns the conversion write.

## Status

Implemented (`campaigns`, `leads`; `crm.e2e-spec.ts`): campaigns incl.
health camps with a per-status funnel count; leads with source/campaign/
referrer/owner, consent-to-contact, a soft duplicate-phone warning,
append-only activity history, consent-gated outreach (calls/messages/
emails refused without consent), automatic NEW → CONTACTED, LOST with a
reason. Conversion (`POST /leads/:id/convert`) either links an existing
patient or runs the same duplicate-detection `PatientsService.register`
uses — a possible/ambiguous match is returned for staff review instead of
converting, so conversion never creates a duplicate patient. Contact
consent carries over as a MARKETING_COMMUNICATION PatientConsent. Who owns
conversion is still open (#5): it needs `lead:write` + `patient:write`,
which only ADMINISTRATOR holds today. Nurture content/automation sending
is not built (no messaging provider).
