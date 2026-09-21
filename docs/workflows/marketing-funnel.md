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

## Not yet implemented

Everything above is a domain boundary and a documented flow — `leads`,
`crm`, `marketing`, `campaigns` are lean module shells today (no
controllers/services). Implementation follows once the conversion
ownership question is resolved.
