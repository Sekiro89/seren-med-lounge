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

All modules referenced above exist as boundaries in `apps/api/src/*`
(mostly lean shells; `encounters` has the full controller/service
pattern). No workflow logic is implemented yet — this document defines
the target shape so implementation order is deliberate rather than ad hoc.
