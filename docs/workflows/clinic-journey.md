# Clinic Journey

```
ENTRY → OPD REGISTRATION → VITALS/INTAKE → DOCTOR CONSULTATION
  → BILLING → FULFILMENT → DISCHARGE → FOLLOW-UP → REVIEW → RETENTION
```

## Entry sources

`AppointmentEntrySource` (`@serenemed/types`): `ONLINE_BOOKING`,
`RECEPTION_WALK_IN`, `VIDEO_CONSULTATION`, `CAMP`.

## OPD registration (`registration` module)

Captures: patient identification, photo, ID, insurance details, PAN
(where required), visit type, consent, and issues a queue token
(`queue` module). See `docs/database/erd.md` for `Registration` /
`QueueEntry` shape.

## Vitals / intake (`vitals` module)

Blood pressure, pulse, SpO2, temperature, BMI, plus any other
intake/workup fields a given clinic collects. Attaches to the
`Encounter`, not directly to `Patient`, since it's per-visit data.

## Doctor consultation (`encounters`, `clinical-notes`, `diagnoses`, `prescriptions`, `labs`, `referrals`, `procedures`)

The doctor sees: patient timeline (`patient-timeline` module — unified
chronological view), previous reports, then records examination,
diagnosis, clinical notes, prescriptions, lab orders, referrals, and
procedures. The AI consultation assistant can participate here — see
`doctor-consultation.md`. Every write in this step that becomes part of
the permanent record follows the immutability rule in
`docs/architecture/security.md`.

## Billing → Fulfilment → Discharge → Follow-up → Review → Retention

See `billing.md`, `pharmacy.md`, and `follow-up.md` for the respective
steps. Discharge is the point where a `CarePlan` and initial `FollowUp`
entries are created for the patient.

## Status

All modules referenced above exist as boundaries in `apps/api/src/*`.
`appointments`, `encounters`, `vitals`, and `clinical-notes` are
implemented and live-verified — the "clinic journey spine" slice: book
an appointment, check in (atomically opens an `Encounter` — see
`AppointmentsService.checkIn()`), record vitals against that encounter,
and write a clinical note through its full draft → sign-off → amend
lifecycle (see `docs/architecture/security.md#clinical-record-immutability`).
Everything else on this page — `registration`, `queue`, `diagnoses`,
`prescriptions`, `labs`, `referrals`, `procedures`, `patient-timeline`,
and the billing/fulfilment/discharge/follow-up/review/retention steps —
remains a lean shell or unimplemented; this document still defines the
target shape for those so implementation order stays deliberate rather
than ad hoc.
