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

All four modules are lean shells today — no scheduling, reminder, or
review logic implemented yet.
