# Follow-up / Retention

Covers the tail end of the clinic journey: discharge through retention
and referral.

## Modules involved

`followups`, `care-plans`, `notifications`, `reviews`.

## Concepts

- **Discharge** creates a `CarePlan` and initial `FollowUp` entries.
- **Medication reminders** and **recovery check-ins** are scheduled
  `FollowUp` items dispatched via `notifications` (event-driven — see
  `docs/architecture/integrations.md` and the event list in
  `docs/architecture/system-architecture.md`).
- **Follow-up appointments** loop back into the `appointments` module
  rather than being a separate booking mechanism.
- **Review requests** are consent-based — a review is only requested if
  the patient's consent record permits post-visit contact for that
  purpose (see `patient-consent`).
- **Retention / referral** — tracked as outcomes on the patient's
  timeline (`patient-timeline`), not a separate disconnected CRM stage;
  a successful referral can feed back into `leads`/`crm` as a new lead
  source (`LeadSource.REFERRAL`).

## Status

Implemented (`care-plans`, `followups`, `reviews`, `notifications`;
`care.e2e-spec.ts`, `reviews.e2e-spec.ts`): discharge creates the care plan
and first follow-ups atomically; follow-up worklists (`?view=today|overdue`,
`?mine=true`); done / missed / cancel / escalate (escalation raises an
in-app alert to the assignee or senior doctors); review appointments are
booked through `AppointmentsService`; patients see their plans at
`/patients/me/care-plans`. Review requests are consent-gated
(MARKETING_COMMUNICATION) and stage-gated (after 2nd consultation, after
first completed follow-up, after a completed procedure); patients submit
text or video-metadata reviews with explicit publish consent; staff
moderate. Reminders are a staff worklist plus in-app notifications only —
no SMS/WhatsApp provider is contracted, so nothing reaches the patient's
phone.
