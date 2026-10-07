#!/usr/bin/env node
/**
 * Generates docs/product/RBAC_CONFIRMATION.md, the access plan the clinic
 * signs off, from the real permission matrix and plain-language labels in
 * @serenemed/permissions (the same source the API enforces and the staff
 * "Staff and roles" screen shows), so the document cannot drift from the
 * system.
 *
 * Run (after `pnpm --filter @serenemed/permissions build`):
 *   node scripts/generate-rbac-doc.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { ROLE_PERMISSIONS, PERMISSION_LABELS, AREA_ORDER } = require('../packages/permissions/dist');

const ROLES = {
  ADMINISTRATOR: {
    name: 'Administrator',
    who: 'Clinic owner or manager with full oversight.',
  },
  RECEPTION: {
    name: 'Reception',
    who: 'Front desk: registers patients, books and checks them in, runs the token queue.',
  },
  NURSE: {
    name: 'Nurse',
    who: 'Takes vitals and history, runs follow-up check-ins, supports the queue.',
  },
  JUNIOR_DOCTOR: {
    name: 'Junior doctor',
    who: 'Assesses patients and writes drafts; a senior doctor signs them off.',
  },
  SENIOR_DOCTOR: {
    name: 'Senior doctor',
    who: 'Consults, signs off clinical records, runs surgery, discharges visits.',
  },
  SURGERY_COORDINATOR: {
    name: 'Surgery coordinator',
    who: 'Plans and schedules procedures and surgeries.',
  },
  LAB_TECHNICIAN: { name: 'Lab technician', who: 'Enters lab results.' },
  PHARMACY: { name: 'Pharmacy', who: 'Dispenses medicines and manages stock.' },
  BILLING: { name: 'Billing', who: 'Issues invoices, records payments and refunds.' },
  INSURANCE: { name: 'Insurance', who: 'Handles pre-authorisation and claims.' },
  MARKETING: { name: 'Marketing', who: 'Leads, campaigns and reviews.' },
};

const roleKeys = Object.keys(ROLES);
const perms = Object.keys(PERMISSION_LABELS);
const has = (role, p) => ROLE_PERMISSIONS[role].includes(p);
const out = [];
const line = (s = '') => out.push(s);

line('# SereneMed Lounge: Staff Access Plan for Confirmation');
line();
line(
  '> This file is generated from the system itself by `scripts/generate-rbac-doc.mjs`. ' +
    'Do not edit it by hand: change the rules in the code, then regenerate.',
);
line();
line('## What we are asking you to confirm');
line();
line(
  'SereneMed gives every staff member a **role**, and each role can see and do only what ' +
    'that job needs. This document lists exactly what we have set up for each role, ' +
    'based on how a typical clinic works. **These are our proposed defaults, not final.** ' +
    'Please review the roles, answer the questions in section 4, and sign at the end. ' +
    'Anything you change is a small adjustment on our side.',
);
line();
line('You can also see all of this live in the product, under **Staff and roles**.');
line();
line('## 1. How access works');
line();
line('1. **Each person has one role.** Their menu shows only the desks that role may use.');
line(
  '2. **The system enforces it, not just the screen.** Even if someone types a page address ' +
    'they should not open, the server refuses the request.',
);
line(
  '3. **Doctors draft, senior doctors sign.** Junior doctors write drafts of notes and diagnoses; ' +
    'a senior doctor signs them off, and a signed record can only be amended, never overwritten.',
);
line(
  '4. **Every change is recorded.** Who did what and when is kept in an audit trail that ' +
    'administrators can read.',
);
line('5. **Patients see only their own record**, through their own login, never any staff screen.');
line('6. **Clinics are kept apart.** Staff of one clinic can never see another clinic.');
line(
  '7. **The queue follows the patient.** Each desk sees the patients waiting at its own ' +
    'station (vitals, doctor, lab, billing, pharmacy) and hands them on to the next. The front ' +
    'desk sees the whole clinic and can move anyone.',
);
line();
line('## 2. The roles at a glance');
line();
line('| Role | Who | Abilities |');
line('| --- | --- | --- |');
for (const key of roleKeys) {
  line(
    `| **${ROLES[key].name}** | ${ROLES[key].who} | ${ROLE_PERMISSIONS[key].length} of ${perms.length} |`,
  );
}
line();
for (const key of roleKeys) {
  line(`### ${ROLES[key].name}`);
  line();
  line(`*${ROLES[key].who}*`);
  line();
  for (const area of AREA_ORDER) {
    const mine = perms.filter((p) => PERMISSION_LABELS[p].area === area && has(key, p));
    if (mine.length === 0) continue;
    line(`- **${area}:** ${mine.map((p) => PERMISSION_LABELS[p].label).join('; ')}`);
  }
  line();
}
line('## 3. The full grid');
line();
line('A tick means the role is allowed to do it.');
line();
line(`| Ability | ${roleKeys.map((k) => ROLES[k].name).join(' | ')} |`);
line(`| --- | ${roleKeys.map(() => ':---:').join(' | ')} |`);
for (const area of AREA_ORDER) {
  line(`| **${area}** | ${roleKeys.map(() => '').join(' | ')} |`);
  for (const p of perms.filter((x) => PERMISSION_LABELS[x].area === area)) {
    line(
      `| ${PERMISSION_LABELS[p].label} | ${roleKeys.map((k) => (has(k, p) ? 'Yes' : '-')).join(' | ')} |`,
    );
  }
}
line();
line('## 4. Questions for you');
line();
line('For each, our proposal is in bold. Tick **Agree** or write the change you want.');
line();
const questions = [
  [
    'Taking payments',
    'Only **Billing** (and Administrators) can record payments and refunds. Reception cannot take cash at the desk.',
    'Should Reception also be able to record payments?',
  ],
  [
    'Signing off clinical records',
    'Only **Senior doctors** (and Administrators) can sign off notes and diagnoses. Junior doctors write drafts only.',
    'Is that the right split?',
  ],
  [
    'Discharging a visit',
    'Only **Senior doctors** (and Administrators) can discharge a visit.',
    'Should Junior doctors be able to discharge too?',
  ],
  [
    'Who sees clinical records',
    'Nurses, doctors, the surgery coordinator, lab technicians and Administrators can view clinical records. **Reception, Pharmacy, Billing, Insurance and Marketing cannot.**',
    'Anyone to add or remove?',
  ],
  [
    'Seeing appointments',
    'Reception, Nurses, Doctors and Administrators can see the appointment list.',
    'Should Pharmacy or Billing see it too?',
  ],
  [
    'Ordering vs entering lab tests',
    '**Doctors order** lab tests; **Lab technicians enter results** but cannot order.',
    'Is that right for your lab?',
  ],
  [
    'Turning a lead into a patient',
    'Today only **Administrators** can do this, because it creates a patient record. ',
    'Should Marketing or Reception be able to convert leads?',
  ],
  [
    'Refund approval',
    'Billing can issue any refund. There is **no approval step or limit** yet.',
    'Do you want refunds above an amount to need an Administrator?',
  ],
  ['Audit log', 'Only **Administrators** can read the audit log.', 'Anyone else?'],
  [
    'Escalating a patient claim',
    'Reception can escalate and also resolve a patient-account claim; there is **no separate reviewer**.',
    'Should only an Administrator resolve escalated claims?',
  ],
  [
    'Messages from patients',
    'Reception, Nurses, Doctors and Administrators can answer patient messages.',
    'Anyone to add or remove?',
  ],
  [
    'Custom roles',
    'The system ships with the **11 fixed roles** above. Changing what a role can do is done by our team, not on screen.',
    'Do you need to create your own roles or edit abilities yourselves?',
  ],
];
questions.forEach(([title, plan, ask], i) => {
  line(`### ${i + 1}. ${title}`);
  line();
  line(`${plan}`);
  line();
  line(`*${ask}*`);
  line();
  line('- [ ] Agree');
  line('- [ ] Change to: ______________________________________________');
  line();
});
line('## 5. Confirmation');
line();
line(
  'By signing, the clinic confirms this access plan (with any changes written above) as the starting configuration.',
);
line();
line('| | |');
line('| --- | --- |');
line('| Clinic name | |');
line('| Name | |');
line('| Position | |');
line('| Date | |');
line('| Signature | |');
line();

writeFileSync(new URL('../docs/product/RBAC_CONFIRMATION.md', import.meta.url), out.join('\n'));
console.log(
  `Wrote docs/product/RBAC_CONFIRMATION.md (${roleKeys.length} roles, ${perms.length} abilities)`,
);
