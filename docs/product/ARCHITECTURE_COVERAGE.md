# SereneMed Lounge: what is built, against the architecture diagram

Status on 7 October 2026, checked box by box against the "Digital Clinic
Operating System" diagram. **Built** means it works end to end in the
staff app or the patient app, with the API behind it and automated tests.
**Backend only** means the API and database exist but no screen uses it
yet. **Needs a provider** means it is designed and wired to a port, but
no outside company has been chosen, so it does nothing real yet. Those
provider choices are the only items deliberately left out of this build.

## Patient Interface

| Box           | Status           | Notes                                                                                                |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| Appointments  | Built            | Book online in four steps, cancel up to 2 hours before, see past visits with what happened.          |
| Video consult | Needs a provider | Can be booked; the Join button explains that video is not switched on yet and the clinic will phone. |
| Payments      | Partly built     | Bills and receipts are shown; paying online needs a payment gateway.                                 |
| Records       | Built            | Medicines, test results, care plan, documents, and a health summary to show any doctor.              |
| Reports       | Built            | Each test result against its normal range, in words.                                                 |
| Messages      | Built            | Conversations with the clinic, replies, unread alerts.                                               |

## Unified Patient Record

| Box                                               | Status | Notes                                                                                                                                                           |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile, Visits, Vitals, Diagnoses, Prescriptions | Built  |                                                                                                                                                                 |
| Documents                                         | Built  | Real file uploads (photos, ID, PDFs, short videos) from the staff app; patients can open their own. Stored on the server's disk until a cloud bucket is chosen. |
| Consent                                           | Built  | Treatment consent is recorded at check-in; all four consent types can be recorded and reviewed on the patient record.                                           |
| Clinical timeline                                 | Built  | One chronological view of everything, for staff and (signed-off entries only) for the patient.                                                                  |

## Staff Workspaces

All eleven roles exist with their own menus and permissions (38 abilities), enforced by the API, with a client sign-off document (`RBAC_CONFIRMATION.md`).

## Pre-appointment marketing funnel

| Box                                                    | Status           | Notes                                                                                                 |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------- |
| Lead sources, Lead capture and CRM                     | Built            | Sources, campaigns, lead owner, activities, conversion to patient, consent to contact.                |
| MCB 4-phase marketing engine                           | Partly built     | Campaigns exist; the awareness, education, objection and conversion phases are not modelled as steps. |
| Marketing nurture (automated follow-ups, content, CTA) | Needs a provider | Sending anything needs the SMS/WhatsApp/email provider.                                               |
| Retention and referrals                                | Built            | Referrals, review requests, follow-ups.                                                               |

## Patient entry and registration

| Box                                                                                                           | Status | Notes                                                |
| ------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| Online booking, Reception, Video consultation booking, Health camp                                            | Built  | Camp is an entry source and a campaign type.         |
| OPD registration: photo capture, ID proof, insurance, PAN, cancer check, visit type, consent, token and queue | Built  | Photo capture opens the camera on a phone or tablet. |

## Vitals and intake, clinical template engine

| Box                                                                                                                                        | Status | Notes                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| Vitals (BP, pulse, SpO2, temperature, RR, height, weight, BMI), history and allergies                                                      | Built  | Nurses record them. Whether doctors may too is an open decision.                                |
| Metabolic workup (glucose, HbA1c, lipids, body composition, other tests)                                                                   | Built  |                                                                                                 |
| Template engine: consultation, prescription, surgery/OT, discharge summary; edit before finalising; amend after; version history and audit | Built  | Templates are managed by senior doctors; structured custom fields are stored but not yet shown. |

## Clinical consultation and actions

| Box                                                                                | Status           | Notes                                                        |
| ---------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| Consultation route (junior assessment or direct senior)                            | Built            |                                                              |
| Patient timeline, reports, clinical examination (notes)                            | Built            |                                                              |
| Interactive anatomy                                                                | Not built        | No backing for it; needs a product decision.                 |
| AI consultation assistant (recording, transcript, draft note, review and finalise) | Needs a provider | Consent type and note versioning exist; the model is a stub. |
| Pharmacy ready alert, Lab ready alert                                              | Built            | In-app notifications to the desk.                            |
| Prescription, Lab investigation, Procedure and surgery, Observation and referral   | Built            |                                                              |
| Video follow-up                                                                    | Needs a provider |                                                              |

## Fulfilment, payment, care and reviews

| Box                                                                                                   | Status | Notes                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Billing: invoice, payment, insurance, pharmacy issue, consumables, home delivery                      | Built  |                                                                         |
| Payments: cash, UPI, card, split payments, ledger                                                     | Built  | Advance payment before an online consultation needs the gateway.        |
| Insurance status and communication                                                                    | Built  | Policies, pre-authorisation, claims, settlement, notes.                 |
| Post-treatment care: discharge instructions, reminders, recovery check-ins, report alerts, escalation | Built  | Reminders are in-app until a messaging provider exists.                 |
| Follow-up and closure                                                                                 | Built  |                                                                         |
| Reviews and testimonials: text, rating, consent                                                       | Built  | Video testimonials can be uploaded as documents; no dedicated flow yet. |

## Clinic operations and integrations

| Box                                                                                           | Status           | Notes                                                   |
| --------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| Clinic command centre: doctor calendar, shared schedule, tasks, reminders, completion updates | Built            | Doctor schedules also drive online booking.             |
| Lab: book tests, manual results, doctor alerts                                                | Built            | API upload and pulling results need the lab partner.    |
| Surgery and procedures: estimate, schedule, pre-op checklist, OT notes, consent, discharge    | Built            |                                                         |
| Pharmacy and inventory: catalogue, batches, FEFO, stock and wastage, home-delivery dispatch   | Built            |                                                         |
| Accounting (Zoho): journal entries, invoices, refunds, GST, sync                              | Needs a provider | GST amounts are on invoices; nothing is sent anywhere.  |
| Existing systems and APIs                                                                     | Needs a provider | Keys can be stored on the Integrations page, encrypted. |

## Foundations (bottom bar)

| Box                    | Status          | Notes                                                                                                                                                  |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role-based access      | Built           |                                                                                                                                                        |
| Audit trail            | Built           | Every change, searchable, no clinical free text.                                                                                                       |
| Patient consent        | Built           |                                                                                                                                                        |
| Data encryption        | Partly built    | Integration keys encrypted at rest; TLS via Caddy is configured but unproven on a real domain; database at-rest encryption depends on the host.        |
| Backups                | Built, unhosted | Nightly dumps plus the files volume, with restore and verify scripts tested against the dev database. Point-in-time recovery needs a managed database. |
| Configurable templates | Built           |                                                                                                                                                        |
| Amendment history      | Built           |                                                                                                                                                        |

## Infrastructure

Built: production Docker Compose (reverse proxy with automatic HTTPS, API, both web apps, Postgres, Redis, backup sidecar, persistent storage), health checks in every image, CI that tests everything and publishes all three images, and a runbook (first deploy, update, rollback, restore, key rotation). Not decided: which server or cloud runs it, a managed database for point-in-time recovery, an off-site bucket for backups and uploads, alerting.

## Decisions waiting on the clinic

Collected in `docs/architecture/open-questions.md`, sections 14 to 20. The ones that change what patients see:

1. Payment gateway and consultation fee (unlocks online payment and pay-before-video).
2. Video provider (unlocks video consultations and video follow-up).
3. Messaging provider (unlocks reminders, nurture, activation codes by SMS).
4. Whether patients see lab results before a doctor has reviewed them (today: yes, immediately).
5. Online booking rules: 60 days ahead, 30 minutes' notice, 3 upcoming bookings, cancel 2 hours before, no reception approval.
6. Whether doctors may record vitals.
7. Where uploaded files live in production (cloud bucket), and how long they are kept.
