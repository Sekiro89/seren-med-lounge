# SereneMed Lounge: Staff Access Plan for Confirmation

> This file is generated from the system itself by `scripts/generate-rbac-doc.mjs`. Do not edit it by hand: change the rules in the code, then regenerate.

## What we are asking you to confirm

SereneMed gives every staff member a **role**, and each role can see and do only what that job needs. This document lists exactly what we have set up for each role, based on how a typical clinic works. **These are our proposed defaults, not final.** Please review the roles, answer the questions in section 4, and sign at the end. Anything you change is a small adjustment on our side.

You can also see all of this live in the product, under **Staff and roles**.

## 1. How access works

1. **Each person has one role.** Their menu shows only the desks that role may use.
2. **The system enforces it, not just the screen.** Even if someone types a page address they should not open, the server refuses the request.
3. **Doctors draft, senior doctors sign.** Junior doctors write drafts of notes and diagnoses; a senior doctor signs them off, and a signed record can only be amended, never overwritten.
4. **Every change is recorded.** Who did what and when is kept in an audit trail that administrators can read.
5. **Patients see only their own record**, through their own login, never any staff screen.
6. **Clinics are kept apart.** Staff of one clinic can never see another clinic.

## 2. The roles at a glance

| Role                    | Who                                                                             | Abilities |
| ----------------------- | ------------------------------------------------------------------------------- | --------- |
| **Administrator**       | Clinic owner or manager with full oversight.                                    | 37 of 37  |
| **Reception**           | Front desk: registers patients, books and checks them in, runs the token queue. | 8 of 37   |
| **Nurse**               | Takes vitals and history, runs follow-up check-ins, supports the queue.         | 8 of 37   |
| **Junior doctor**       | Assesses patients and writes drafts; a senior doctor signs them off.            | 13 of 37  |
| **Senior doctor**       | Consults, signs off clinical records, runs surgery, discharges visits.          | 18 of 37  |
| **Surgery coordinator** | Plans and schedules procedures and surgeries.                                   | 4 of 37   |
| **Lab technician**      | Enters lab results.                                                             | 3 of 37   |
| **Pharmacy**            | Dispenses medicines and manages stock.                                          | 3 of 37   |
| **Billing**             | Issues invoices, records payments and refunds.                                  | 4 of 37   |
| **Insurance**           | Handles pre-authorisation and claims.                                           | 2 of 37   |
| **Marketing**           | Leads, campaigns and reviews.                                                   | 4 of 37   |

### Administrator

_Clinic owner or manager with full oversight._

- **Front desk:** View patient details; Register patients and resolve duplicate claims; View appointments; Book and check in appointments; Run the token queue; Set doctor schedules
- **Clinical:** View clinical records; Discharge a visit; Record vitals and metabolic workup; Record allergies and medical history; Write draft clinical notes; Sign off clinical notes; Write draft diagnoses; Sign off diagnoses; Issue prescriptions; Order lab tests; Enter lab results; Plan and run procedures; Plan and run surgeries; Create referrals; Manage follow-ups and care plans; Manage note templates
- **Pharmacy:** Dispense medicines; Manage medicines and stock
- **Finance:** Issue and void invoices; Record payments; Issue refunds; Manage insurance cases
- **Growth:** View leads; Manage and convert leads; Manage campaigns; Request and moderate reviews
- **Team:** Answer patient messages
- **Administration:** Manage staff accounts; Manage roles; Read the audit log; Manage integrations and API keys

### Reception

_Front desk: registers patients, books and checks them in, runs the token queue._

- **Front desk:** View patient details; Register patients and resolve duplicate claims; View appointments; Book and check in appointments; Run the token queue; Set doctor schedules
- **Growth:** View leads
- **Team:** Answer patient messages

### Nurse

_Takes vitals and history, runs follow-up check-ins, supports the queue._

- **Front desk:** View patient details; View appointments; Run the token queue
- **Clinical:** View clinical records; Record vitals and metabolic workup; Record allergies and medical history; Manage follow-ups and care plans
- **Team:** Answer patient messages

### Junior doctor

_Assesses patients and writes drafts; a senior doctor signs them off._

- **Front desk:** View patient details; View appointments; Run the token queue
- **Clinical:** View clinical records; Record allergies and medical history; Write draft clinical notes; Write draft diagnoses; Issue prescriptions; Order lab tests; Plan and run procedures; Create referrals; Manage follow-ups and care plans
- **Team:** Answer patient messages

### Senior doctor

_Consults, signs off clinical records, runs surgery, discharges visits._

- **Front desk:** View patient details; View appointments; Run the token queue
- **Clinical:** View clinical records; Discharge a visit; Record allergies and medical history; Write draft clinical notes; Sign off clinical notes; Write draft diagnoses; Sign off diagnoses; Issue prescriptions; Order lab tests; Plan and run procedures; Plan and run surgeries; Create referrals; Manage follow-ups and care plans; Manage note templates
- **Team:** Answer patient messages

### Surgery coordinator

_Plans and schedules procedures and surgeries._

- **Front desk:** View patient details
- **Clinical:** View clinical records; Plan and run procedures; Plan and run surgeries

### Lab technician

_Enters lab results._

- **Front desk:** View patient details
- **Clinical:** View clinical records; Enter lab results

### Pharmacy

_Dispenses medicines and manages stock._

- **Front desk:** View patient details
- **Pharmacy:** Dispense medicines; Manage medicines and stock

### Billing

_Issues invoices, records payments and refunds._

- **Front desk:** View patient details
- **Finance:** Issue and void invoices; Record payments; Issue refunds

### Insurance

_Handles pre-authorisation and claims._

- **Front desk:** View patient details
- **Finance:** Manage insurance cases

### Marketing

_Leads, campaigns and reviews._

- **Growth:** View leads; Manage and convert leads; Manage campaigns; Request and moderate reviews

## 3. The full grid

A tick means the role is allowed to do it.

| Ability                                        | Administrator | Reception | Nurse | Junior doctor | Senior doctor | Surgery coordinator | Lab technician | Pharmacy | Billing | Insurance | Marketing |
| ---------------------------------------------- | :-----------: | :-------: | :---: | :-----------: | :-----------: | :-----------------: | :------------: | :------: | :-----: | :-------: | :-------: |
| **Front desk**                                 |               |           |       |               |               |                     |                |          |         |           |           |
| View patient details                           |      Yes      |    Yes    |  Yes  |      Yes      |      Yes      |         Yes         |      Yes       |   Yes    |   Yes   |    Yes    |     -     |
| Register patients and resolve duplicate claims |      Yes      |    Yes    |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| View appointments                              |      Yes      |    Yes    |  Yes  |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Book and check in appointments                 |      Yes      |    Yes    |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| Run the token queue                            |      Yes      |    Yes    |  Yes  |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Set doctor schedules                           |      Yes      |    Yes    |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| **Clinical**                                   |               |           |       |               |               |                     |                |          |         |           |           |
| View clinical records                          |      Yes      |     -     |  Yes  |      Yes      |      Yes      |         Yes         |      Yes       |    -     |    -    |     -     |     -     |
| Discharge a visit                              |      Yes      |     -     |   -   |       -       |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Record vitals and metabolic workup             |      Yes      |     -     |  Yes  |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| Record allergies and medical history           |      Yes      |     -     |  Yes  |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Write draft clinical notes                     |      Yes      |     -     |   -   |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Sign off clinical notes                        |      Yes      |     -     |   -   |       -       |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Write draft diagnoses                          |      Yes      |     -     |   -   |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Sign off diagnoses                             |      Yes      |     -     |   -   |       -       |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Issue prescriptions                            |      Yes      |     -     |   -   |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Order lab tests                                |      Yes      |     -     |   -   |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Enter lab results                              |      Yes      |     -     |   -   |       -       |       -       |          -          |      Yes       |    -     |    -    |     -     |     -     |
| Plan and run procedures                        |      Yes      |     -     |   -   |      Yes      |      Yes      |         Yes         |       -        |    -     |    -    |     -     |     -     |
| Plan and run surgeries                         |      Yes      |     -     |   -   |       -       |      Yes      |         Yes         |       -        |    -     |    -    |     -     |     -     |
| Create referrals                               |      Yes      |     -     |   -   |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Manage follow-ups and care plans               |      Yes      |     -     |  Yes  |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| Manage note templates                          |      Yes      |     -     |   -   |       -       |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| **Pharmacy**                                   |               |           |       |               |               |                     |                |          |         |           |           |
| Dispense medicines                             |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |   Yes    |    -    |     -     |     -     |
| Manage medicines and stock                     |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |   Yes    |    -    |     -     |     -     |
| **Finance**                                    |               |           |       |               |               |                     |                |          |         |           |           |
| Issue and void invoices                        |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |   Yes   |     -     |     -     |
| Record payments                                |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |   Yes   |     -     |     -     |
| Issue refunds                                  |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |   Yes   |     -     |     -     |
| Manage insurance cases                         |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |    Yes    |     -     |
| **Growth**                                     |               |           |       |               |               |                     |                |          |         |           |           |
| View leads                                     |      Yes      |    Yes    |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |    Yes    |
| Manage and convert leads                       |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |    Yes    |
| Manage campaigns                               |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |    Yes    |
| Request and moderate reviews                   |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |    Yes    |
| **Team**                                       |               |           |       |               |               |                     |                |          |         |           |           |
| Answer patient messages                        |      Yes      |    Yes    |  Yes  |      Yes      |      Yes      |          -          |       -        |    -     |    -    |     -     |     -     |
| **Administration**                             |               |           |       |               |               |                     |                |          |         |           |           |
| Manage staff accounts                          |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| Manage roles                                   |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| Read the audit log                             |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |
| Manage integrations and API keys               |      Yes      |     -     |   -   |       -       |       -       |          -          |       -        |    -     |    -    |     -     |     -     |

## 4. Questions for you

For each, our proposal is in bold. Tick **Agree** or write the change you want.

### 1. Taking payments

Only **Billing** (and Administrators) can record payments and refunds. Reception cannot take cash at the desk.

_Should Reception also be able to record payments?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 2. Signing off clinical records

Only **Senior doctors** (and Administrators) can sign off notes and diagnoses. Junior doctors write drafts only.

_Is that the right split?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 3. Discharging a visit

Only **Senior doctors** (and Administrators) can discharge a visit.

_Should Junior doctors be able to discharge too?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 4. Who sees clinical records

Nurses, doctors, the surgery coordinator, lab technicians and Administrators can view clinical records. **Reception, Pharmacy, Billing, Insurance and Marketing cannot.**

_Anyone to add or remove?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 5. Seeing appointments

Reception, Nurses, Doctors and Administrators can see the appointment list.

_Should Pharmacy or Billing see it too?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 6. Ordering vs entering lab tests

**Doctors order** lab tests; **Lab technicians enter results** but cannot order.

_Is that right for your lab?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 7. Turning a lead into a patient

Today only **Administrators** can do this, because it creates a patient record.

_Should Marketing or Reception be able to convert leads?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 8. Refund approval

Billing can issue any refund. There is **no approval step or limit** yet.

_Do you want refunds above an amount to need an Administrator?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 9. Audit log

Only **Administrators** can read the audit log.

_Anyone else?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 10. Escalating a patient claim

Reception can escalate and also resolve a patient-account claim; there is **no separate reviewer**.

_Should only an Administrator resolve escalated claims?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 11. Messages from patients

Reception, Nurses, Doctors and Administrators can answer patient messages.

_Anyone to add or remove?_

- [ ] Agree
- [ ] Change to: ______________________________________________

### 12. Custom roles

The system ships with the **11 fixed roles** above. Changing what a role can do is done by our team, not on screen.

_Do you need to create your own roles or edit abilities yourselves?_

- [ ] Agree
- [ ] Change to: ______________________________________________

## 5. Confirmation

By signing, the clinic confirms this access plan (with any changes written above) as the starting configuration.

|             |     |
| ----------- | --- |
| Clinic name |     |
| Name        |     |
| Position    |     |
| Date        |     |
| Signature   |     |
