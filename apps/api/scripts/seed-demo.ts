/**
 * Dev-only demo data, so the staff screens have something real to show
 * for every role. Creates (or resets) one organization, "demo-clinic",
 * with a staff user per role, a dozen patients, today's appointments, a
 * live token queue, invoices, prescriptions waiting at the pharmacy and
 * follow-ups due today.
 *
 * Every staff user signs in with the same password. NEVER run this against
 * a real database: it deletes everything under the demo-clinic organization
 * (and only that organization) first, so it's safe to re-run.
 *
 * Uses DIRECT_DATABASE_URL (the owner role) because there's no tenant
 * context before the first user exists; same reason as seed-dev.ts.
 *
 * Run (from apps/api): pnpm exec ts-node -O '{"module":"commonjs"}' scripts/seed-demo.ts
 */
import 'reflect-metadata';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Node's built-in .env loader (no extra dependency); the same file Prisma reads.
process.loadEnvFile('.env');

const ORG_ID = 'demo-clinic';

/**
 * Dev scripts hold well-known demo passwords, so they refuse to run
 * anywhere that isn't clearly a local development database.
 */
function assertLocalDevOnly(scriptName: string): void {
  const url = process.env.DIRECT_DATABASE_URL ?? '';
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? '';
  const local = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host);
  if (process.env.NODE_ENV === 'production' || !local) {
    throw new Error(
      `${scriptName} is for local development only (it creates well-known demo logins). ` +
        `Refusing to run with NODE_ENV=${process.env.NODE_ENV ?? 'unset'} against host "${host || 'unknown'}".`,
    );
  }
}

const PASSWORD = 'dev-password-123';

/** Children before parents so foreign keys never block the wipe. */
const WIPE_ORDER = [
  'auditLog',
  'integrationSetting',
  'message',
  'messageThread',
  'notification',
  'staffTask',
  'doctorAvailability',
  'review',
  'reviewRequest',
  'leadActivity',
  'lead',
  'campaign',
  'insuranceCaseEvent',
  'insuranceCase',
  'insurancePolicy',
  'followUp',
  'carePlan',
  'procedureChecklistItem',
  'procedure',
  'referral',
  'stockMovement',
  'dispensing',
  'stockBatch',
  'medication',
  'refund',
  'payment',
  'invoiceItem',
  'invoice',
  'queueEntry',
  'registration',
  'metabolicWorkup',
  'medicalHistoryEntry',
  'clinicalNoteVersion',
  'clinicalNote',
  'clinicalTemplateVersion',
  'clinicalTemplate',
  'diagnosisVersion',
  'diagnosis',
  'prescriptionItem',
  'prescription',
  'labResult',
  'labOrderItem',
  'labOrder',
  'patientConsent',
  'patientDocument',
  'patientActivationToken',
  'patientClaimRequest',
  'vital',
  'encounter',
  'appointment',
  'user',
  'patient',
] as const;

const STAFF: Array<[string, string, StaffRole]> = [
  ['admin', 'Dr. Kavita Rao', StaffRole.ADMINISTRATOR],
  ['reception', 'Anjali Menon', StaffRole.RECEPTION],
  ['nurse', 'Sunita Pillai', StaffRole.NURSE],
  ['junior', 'Dr. Rohan Kulkarni', StaffRole.JUNIOR_DOCTOR],
  ['senior', 'Dr. Meera Iyer', StaffRole.SENIOR_DOCTOR],
  ['surgery', 'Vikram Desai', StaffRole.SURGERY_COORDINATOR],
  ['lab', 'Farhan Sheikh', StaffRole.LAB_TECHNICIAN],
  ['pharmacy', 'Deepa Nambiar', StaffRole.PHARMACY],
  ['billing', 'Harish Gupta', StaffRole.BILLING],
  ['insurance', 'Neha Bhatia', StaffRole.INSURANCE],
  ['marketing', 'Arjun Reddy', StaffRole.MARKETING],
];

const PATIENTS: Array<[string, string, string, string]> = [
  ['Lakshmi', 'Narayanan', '1968-03-14', '9840112233'],
  ['Imran', 'Qureshi', '1985-11-02', '9820456718'],
  ['Pooja', 'Deshpande', '1992-07-21', '9890123456'],
  ['Suresh', 'Babu', '1957-01-09', '9444201987'],
  ['Divya', 'Chaudhary', '1990-05-30', '9811734562'],
  ['Mohan', 'Lal Sethi', '1974-09-18', '9810055123'],
  ['Farida', 'Begum', '1963-12-25', '9848099812'],
  ['Karthik', 'Subramanian', '1981-04-07', '9500612347'],
  ['Ritu', 'Malhotra', '1996-08-12', '9873201654'],
  ['Gopal', 'Krishnan', '1949-02-28', '9447123098'],
  ['Shreya', 'Joshi', '2001-10-05', '9922334455'],
  ['Naveen', 'Hegde', '1978-06-16', '9448765210'],
];

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** A clinic-local time today, e.g. at('10:30'). */
function at(time: string): Date {
  return new Date(`${todayIst()}T${time}:00.000+05:30`);
}

async function main() {
  assertLocalDevOnly('seed-demo.ts');
  const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  const where = { organizationId: ORG_ID };

  for (const model of WIPE_ORDER) {
    const delegate = (
      db as unknown as Record<string, { deleteMany: (a: object) => Promise<unknown> }>
    )[model];
    await delegate?.deleteMany({ where });
  }
  await db.organization.deleteMany({ where: { id: ORG_ID } });
  await db.organization.create({ data: { id: ORG_ID, name: 'SereneMed Demo Clinic' } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users: Record<string, string> = {};
  for (const [key, fullName, role] of STAFF) {
    const user = await db.user.create({
      data: { organizationId: ORG_ID, email: `${key}@demo.local`, passwordHash, fullName, role },
    });
    users[key] = user.id;
  }

  const patients: string[] = [];
  for (const [firstName, lastName, dob, phone] of PATIENTS) {
    const patient = await db.patient.create({
      data: { organizationId: ORG_ID, firstName, lastName, dateOfBirth: new Date(dob), phone },
    });
    patients.push(patient.id);
  }

  // Today's appointments. The first eight are checked in and registered
  // (so they hold a queue token); the rest are still to arrive.
  const plan: Array<[string, string, 'senior' | 'junior', string]> = [
    ['09:00', 'COMPLETED', 'senior', 'BILLING'],
    ['09:15', 'CHECKED_IN', 'senior', 'SENIOR_DOCTOR'],
    ['09:30', 'CHECKED_IN', 'junior', 'JUNIOR_DOCTOR'],
    ['09:45', 'CHECKED_IN', 'senior', 'VITALS'],
    ['10:00', 'CHECKED_IN', 'junior', 'VITALS'],
    ['10:15', 'CHECKED_IN', 'senior', 'PHARMACY'],
    ['10:30', 'CONFIRMED', 'senior', ''],
    ['11:00', 'REQUESTED', 'junior', ''],
    ['11:30', 'CONFIRMED', 'senior', ''],
    ['14:00', 'REQUESTED', 'junior', ''],
  ];
  const queueDate = new Date(`${todayIst()}T00:00:00.000Z`);
  const encounters: Array<{ id: string; patientId: string; doctor: string }> = [];
  let token = 0;

  for (const [index, [time, status, doctor, station]] of plan.entries()) {
    const patientId = patients[index]!;
    const appointment = await db.appointment.create({
      data: {
        organizationId: ORG_ID,
        patientId,
        doctorId: users[doctor]!,
        entrySource: index % 3 === 0 ? 'ONLINE_BOOKING' : 'RECEPTION_WALK_IN',
        status: status as 'CHECKED_IN',
        scheduledAt: at(time),
      },
    });
    if (!station) continue;

    const encounter = await db.encounter.create({
      data: {
        organizationId: ORG_ID,
        patientId,
        appointmentId: appointment.id,
        status: status === 'COMPLETED' ? 'CLOSED' : 'OPEN',
      },
    });
    encounters.push({ id: encounter.id, patientId, doctor });
    await db.registration.create({
      data: {
        organizationId: ORG_ID,
        patientId,
        encounterId: encounter.id,
        visitType: index % 4 === 0 ? 'FOLLOW_UP' : 'NEW_CONSULTATION',
        consultationRoute: doctor === 'junior' ? 'JUNIOR_ASSESSMENT' : 'DIRECT_SENIOR',
        idProofVerified: true,
        registeredById: users.reception!,
      },
    });
    token += 1;
    const queueStatus =
      status === 'COMPLETED'
        ? 'COMPLETED'
        : index % 3 === 1
          ? 'CALLED'
          : index === 2
            ? 'IN_SERVICE'
            : 'WAITING';
    await db.queueEntry.create({
      data: {
        organizationId: ORG_ID,
        patientId,
        encounterId: encounter.id,
        queueDate,
        tokenNumber: token,
        station: station as 'VITALS',
        status: queueStatus as 'WAITING',
      },
    });
  }

  // Prescriptions waiting at the pharmacy.
  for (const e of encounters.slice(1, 4)) {
    await db.prescription.create({
      data: {
        organizationId: ORG_ID,
        patientId: e.patientId,
        encounterId: e.id,
        authorId: users[e.doctor]!,
        items: {
          create: [
            {
              organizationId: ORG_ID,
              medicationName: 'Metformin 500 mg',
              dosage: '1 tablet',
              frequency: 'Twice daily',
              durationDays: 30,
            },
            {
              organizationId: ORG_ID,
              medicationName: 'Atorvastatin 10 mg',
              dosage: '1 tablet',
              frequency: 'At night',
              durationDays: 30,
            },
          ],
        },
      },
    });
  }

  // Invoices: one unpaid, one part-paid, one settled.
  const invoiceSpecs: Array<[number, number, number]> = [
    [0, 85000, 85000],
    [1, 245000, 100000],
    [2, 120000, 0],
  ];
  for (const [number, [patientIndex, total, paid]] of invoiceSpecs.entries()) {
    const invoice = await db.invoice.create({
      data: {
        organizationId: ORG_ID,
        number: number + 1,
        patientId: patients[patientIndex]!,
        status: paid === total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        subtotalMinor: total,
        taxMinor: 0,
        totalMinor: total,
        paidMinor: paid,
        issuedById: users.billing!,
        items: {
          create: [
            {
              organizationId: ORG_ID,
              itemType: 'CONSULTATION',
              description: 'OPD consultation',
              quantity: 1,
              unitPriceMinor: total,
              taxMinor: 0,
              lineTotalMinor: total,
            },
          ],
        },
      },
    });
    // The money behind paidMinor, so the payments ledger agrees with the invoice.
    if (paid > 0) {
      await db.payment.create({
        data: {
          organizationId: ORG_ID,
          invoiceId: invoice.id,
          method: paid === total ? 'UPI' : 'CASH',
          amountMinor: paid,
          reference: paid === total ? `UPI-${1000 + number}` : undefined,
          receivedById: users.billing!,
        },
      });
    }
  }

  // Follow-ups due today and one overdue.
  const plan2 = await db.carePlan.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[0]!,
      title: 'Post-visit recovery',
      createdById: users.senior!,
    },
  });
  await db.followUp.createMany({
    data: [
      {
        organizationId: ORG_ID,
        patientId: patients[0]!,
        carePlanId: plan2.id,
        type: 'RECOVERY_CHECK',
        dueAt: at('12:00'),
        createdById: users.senior!,
        assignedToId: users.nurse!,
      },
      {
        organizationId: ORG_ID,
        patientId: patients[3]!,
        type: 'MEDICATION_REMINDER',
        dueAt: at('15:00'),
        createdById: users.senior!,
        assignedToId: users.nurse!,
      },
      {
        organizationId: ORG_ID,
        patientId: patients[6]!,
        type: 'REVIEW_APPOINTMENT',
        dueAt: new Date(Date.now() - 2 * 86_400_000),
        createdById: users.senior!,
      },
    ],
  });

  // A couple of unread alerts.
  await db.notification.createMany({
    data: [
      {
        organizationId: ORG_ID,
        type: 'PHARMACY_PREPARE',
        recipientRole: 'PHARMACY',
        title: 'Prescription ready to prepare',
        entityType: 'Prescription',
      },
      {
        organizationId: ORG_ID,
        type: 'GENERAL',
        recipientRole: 'RECEPTION',
        title: 'Clinic opens at 09:00. Two online bookings are waiting to be confirmed.',
      },
    ],
  });

  // ---- Pharmacy catalogue and stock (one batch near expiry, one running low).
  const day = 86_400_000;
  const medicines: Array<
    [string, string, string, string, number, number, Array<[string, number, number]>]
  > = [
    [
      'Metformin',
      'TABLET',
      '500 mg',
      'tablet',
      350,
      200,
      [
        ['MET-2411', 400, 0.05],
        ['MET-2502', 600, 1.2],
      ],
    ],
    ['Atorvastatin', 'TABLET', '10 mg', 'tablet', 900, 150, [['ATO-2409', 180, 0.6]]],
    ['Amoxicillin', 'CAPSULE', '500 mg', 'capsule', 1200, 100, [['AMX-2408', 60, 0.04]]],
    ['Pantoprazole', 'TABLET', '40 mg', 'tablet', 700, 120, [['PAN-2503', 500, 1.5]]],
    ['Paracetamol', 'TABLET', '650 mg', 'tablet', 200, 300, [['PCM-2501', 1200, 2.0]]],
    ['Cetirizine', 'TABLET', '10 mg', 'tablet', 250, 100, [['CET-2410', 90, 0.07]]],
  ];
  for (const [name, form, strength, unit, price, reorder, batches] of medicines) {
    const medication = await db.medication.create({
      data: {
        organizationId: ORG_ID,
        name,
        form: form as 'TABLET',
        strength,
        unit,
        unitPriceMinor: price,
        reorderLevel: reorder,
      },
    });
    for (const [batchNumber, qty, years] of batches) {
      await db.stockBatch.create({
        data: {
          organizationId: ORG_ID,
          medicationId: medication.id,
          batchNumber,
          expiryDate: new Date(Date.now() + years * 365 * day),
          quantityReceived: qty + 40,
          quantityOnHand: qty,
          receivedById: users.pharmacy!,
        },
      });
    }
  }

  // ---- Lab orders: one waiting for results, one finished.
  const labEncounters = encounters.slice(0, 2);
  const waiting = await db.labOrder.create({
    data: {
      organizationId: ORG_ID,
      patientId: labEncounters[1]!.patientId,
      encounterId: labEncounters[1]!.id,
      authorId: users.senior!,
      items: {
        create: [
          { organizationId: ORG_ID, testName: 'HbA1c' },
          { organizationId: ORG_ID, testName: 'Lipid profile' },
        ],
      },
    },
  });
  const done = await db.labOrder.create({
    data: {
      organizationId: ORG_ID,
      patientId: labEncounters[0]!.patientId,
      encounterId: labEncounters[0]!.id,
      authorId: users.senior!,
      items: { create: [{ organizationId: ORG_ID, testName: 'Complete blood count' }] },
    },
    include: { items: true },
  });
  await db.labResult.create({
    data: {
      organizationId: ORG_ID,
      labOrderItemId: done.items[0]!.id,
      resultValue: '13.4',
      unit: 'g/dL',
      referenceRange: '12.0 to 15.5',
      enteredById: users.lab!,
    },
  });
  void waiting;

  // ---- A referral to the senior doctor, and a surgery being planned.
  await db.referral.create({
    data: {
      organizationId: ORG_ID,
      patientId: encounters[2]!.patientId,
      encounterId: encounters[2]!.id,
      type: 'INTERNAL',
      toUserId: users.senior!,
      reason: 'Persistent knee pain, needs a senior opinion.',
      urgency: 'URGENT',
      referredById: users.junior!,
    },
  });
  await db.procedure.create({
    data: {
      organizationId: ORG_ID,
      patientId: encounters[3]!.patientId,
      encounterId: encounters[3]!.id,
      kind: 'SURGERY',
      name: 'Laparoscopic cholecystectomy',
      estimateMinor: 8500000,
      createdById: users.senior!,
      checklist: {
        create: [
          { organizationId: ORG_ID, label: 'Fasting from midnight' },
          { organizationId: ORG_ID, label: 'Blood grouping done' },
          { organizationId: ORG_ID, label: 'Anaesthesia review' },
        ],
      },
    },
  });

  // ---- Marketing: two campaigns and a spread of leads.
  const camp = await db.campaign.create({
    data: {
      organizationId: ORG_ID,
      name: 'Diabetes awareness camp',
      type: 'HEALTH_CAMP',
      status: 'ACTIVE',
      location: 'Indiranagar Community Hall',
      startsAt: new Date(Date.now() + 9 * day),
      createdById: users.marketing!,
    },
  });
  const social = await db.campaign.create({
    data: {
      organizationId: ORG_ID,
      name: 'Winter wellness packages',
      type: 'DIGITAL',
      channel: 'Instagram',
      status: 'ACTIVE',
      createdById: users.marketing!,
    },
  });
  const leads: Array<
    [
      string,
      string,
      string,
      string,
      'NEW' | 'CONTACTED' | 'NURTURING' | 'LOST',
      string | null,
      boolean,
    ]
  > = [
    ['Anitha', 'Rajan', '9845012233', 'CAMPAIGN', 'NEW', camp.id, true],
    ['Zubair', 'Khan', '9901233344', 'WEBSITE', 'CONTACTED', null, true],
    ['Meenakshi', 'Sundaram', '9886455512', 'CAMPAIGN', 'NURTURING', social.id, true],
    ['Rahul', 'Bhandari', '9740011223', 'WALK_IN', 'NEW', null, false],
    ['Kavya', 'Menon', '9035122987', 'REFERRAL', 'LOST', null, true],
  ];
  for (const [firstName, lastName, phone, source, status, campaignId, consent] of leads) {
    await db.lead.create({
      data: {
        organizationId: ORG_ID,
        firstName,
        lastName,
        phone,
        source: source as 'WEBSITE',
        status,
        campaignId,
        ownerId: users.marketing!,
        consentToContact: consent,
        consentRecordedAt: consent ? new Date() : null,
        enquiry: status === 'NEW' ? 'Asked about a full-body health check.' : null,
        nextFollowUpAt: status === 'CONTACTED' ? at('16:30') : null,
        lostReason: status === 'LOST' ? 'Chose a clinic closer to home.' : null,
      },
    });
  }

  // ---- Insurance: a policy and a case at the pre-authorisation stage.
  const policy = await db.insurancePolicy.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[1]!,
      insurerName: 'Star Health',
      policyNumber: 'P/151313/01/2026/008812',
      memberId: 'SH-2290417',
      sumInsuredMinor: 50000000,
    },
  });
  const insuranceCase = await db.insuranceCase.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[1]!,
      policyId: policy.id,
      status: 'PRE_AUTH_REQUESTED',
      requestedAmountMinor: 8500000,
      preAuthReference: 'PA-77120',
      createdById: users.insurance!,
    },
  });
  await db.insuranceCaseEvent.createMany({
    data: [
      {
        organizationId: ORG_ID,
        caseId: insuranceCase.id,
        toStatus: 'ELIGIBILITY_CHECK',
        actorId: users.insurance!,
      },
      {
        organizationId: ORG_ID,
        caseId: insuranceCase.id,
        fromStatus: 'ELIGIBILITY_CHECK',
        toStatus: 'PRE_AUTH_REQUESTED',
        amountMinor: 8500000,
        actorId: users.insurance!,
        note: 'Pre-authorisation form sent to the TPA.',
      },
    ],
  });

  // ---- A patient message waiting for the front desk.
  const thread = await db.messageThread.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[4]!,
      subject: 'Can I move my appointment to Friday?',
    },
  });
  await db.message.create({
    data: {
      organizationId: ORG_ID,
      threadId: thread.id,
      senderType: 'PATIENT',
      body: 'Hello, I have a meeting on Thursday. Is there any slot on Friday morning?',
    },
  });

  // ---- A review waiting for moderation.
  const reviewRequest = await db.reviewRequest.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[0]!,
      stage: 'AFTER_SECOND_CONSULTATION',
      dedupeKey: 'AFTER_SECOND_CONSULTATION:-',
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 30 * day),
      requestedById: users.marketing!,
    },
  });
  await db.review.create({
    data: {
      organizationId: ORG_ID,
      patientId: patients[0]!,
      requestId: reviewRequest.id,
      stage: 'AFTER_SECOND_CONSULTATION',
      rating: 5,
      comment: 'The doctor explained everything clearly and the waiting time was short.',
      publishConsent: true,
    },
  });

  // ---- A few tasks.
  await db.staffTask.createMany({
    data: [
      {
        organizationId: ORG_ID,
        title: 'Call Mrs. Narayanan about her recovery',
        assigneeId: users.nurse!,
        createdById: users.senior!,
        priority: 'HIGH',
        dueAt: at('17:00'),
      },
      {
        organizationId: ORG_ID,
        title: 'Reorder Metformin 500 mg',
        assigneeId: users.pharmacy!,
        createdById: users.admin!,
        priority: 'NORMAL',
        dueAt: new Date(Date.now() + 2 * day),
      },
      {
        organizationId: ORG_ID,
        title: "Confirm tomorrow's online bookings",
        assigneeId: users.reception!,
        createdById: users.reception!,
        priority: 'NORMAL',
        dueAt: at('18:00'),
      },
    ],
  });

  // ---- A patient with a portal login and some history (patient-web demo).
  // Pooja is at the clinic today (token with the junior doctor) and also
  // had a visit last month with results, a diagnosis and a prescription.
  const pooja = patients[2]!;
  await db.patient.update({
    where: { id: pooja },
    data: { email: 'patient@demo.local', passwordHash },
  });
  const lastMonth = new Date(Date.now() - 32 * day);
  const pastAppointment = await db.appointment.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      doctorId: users.senior!,
      entrySource: 'ONLINE_BOOKING',
      status: 'COMPLETED',
      scheduledAt: lastMonth,
    },
  });
  const pastVisit = await db.encounter.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      appointmentId: pastAppointment.id,
      status: 'CLOSED',
      startedAt: lastMonth,
      endedAt: lastMonth,
    },
  });
  for (const [icdCode, description] of [
    ['E11.9', 'Type 2 diabetes, without complications'],
    ['E55.9', 'Vitamin D deficiency'],
  ] as const) {
    await db.diagnosis.create({
      data: {
        organizationId: ORG_ID,
        patientId: pooja,
        encounterId: pastVisit.id,
        status: 'FINALIZED',
        currentVersionNumber: 1,
        createdAt: lastMonth,
        versions: {
          create: {
            organizationId: ORG_ID,
            versionNumber: 1,
            status: 'FINALIZED',
            icdCode,
            description,
            authorId: users.senior!,
          },
        },
      },
    });
  }
  const pastLabs = await db.labOrder.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      encounterId: pastVisit.id,
      authorId: users.senior!,
      createdAt: lastMonth,
      items: {
        create: [
          { organizationId: ORG_ID, testName: 'HbA1c' },
          { organizationId: ORG_ID, testName: 'Fasting blood sugar' },
          { organizationId: ORG_ID, testName: 'Vitamin D (25-OH)' },
          { organizationId: ORG_ID, testName: 'Haemoglobin' },
        ],
      },
    },
    include: { items: true },
  });
  const results: Array<[string, string, string]> = [
    ['7.8', '%', '4.0 to 5.6'],
    ['142', 'mg/dL', '70 to 100'],
    ['18', 'ng/mL', '30 to 100'],
    ['12.9', 'g/dL', '12.0 to 15.5'],
  ];
  for (const [i, [resultValue, unit, referenceRange]] of results.entries()) {
    await db.labResult.create({
      data: {
        organizationId: ORG_ID,
        labOrderItemId: pastLabs.items[i]!.id,
        resultValue,
        unit,
        referenceRange,
        enteredById: users.lab!,
        createdAt: new Date(lastMonth.getTime() + day),
      },
    });
  }
  await db.prescription.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      encounterId: pastVisit.id,
      authorId: users.senior!,
      createdAt: lastMonth,
      items: {
        create: [
          {
            organizationId: ORG_ID,
            medicationName: 'Vitamin D3 60,000 IU',
            dosage: '1 sachet',
            frequency: 'Once a week',
            durationDays: 56,
            instructions: 'Mix in milk or water, after a meal.',
          },
        ],
      },
    },
  });
  await db.appointment.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      doctorId: users.senior!,
      entrySource: 'ONLINE_BOOKING',
      status: 'CONFIRMED',
      scheduledAt: new Date(at('10:30').getTime() + 6 * day),
    },
  });
  await db.medicalHistoryEntry.createMany({
    data: [
      {
        organizationId: ORG_ID,
        patientId: pooja,
        category: 'ALLERGY',
        description: 'Penicillin (rash)',
        severity: 'MODERATE',
        recordedById: users.nurse!,
      },
      {
        organizationId: ORG_ID,
        patientId: pooja,
        category: 'CONDITION',
        description: 'Type 2 diabetes, diagnosed 2024',
        recordedById: users.nurse!,
      },
      {
        organizationId: ORG_ID,
        patientId: pooja,
        category: 'FAMILY_HISTORY',
        description: 'Father: heart disease',
        recordedById: users.nurse!,
      },
    ],
  });
  const poojaInvoice = await db.invoice.create({
    data: {
      organizationId: ORG_ID,
      number: invoiceSpecs.length + 1,
      patientId: pooja,
      status: 'PAID',
      subtotalMinor: 180000,
      taxMinor: 0,
      totalMinor: 180000,
      paidMinor: 180000,
      issuedById: users.billing!,
      createdAt: lastMonth,
      items: {
        create: [
          {
            organizationId: ORG_ID,
            itemType: 'CONSULTATION',
            description: 'OPD consultation',
            quantity: 1,
            unitPriceMinor: 80000,
            taxMinor: 0,
            lineTotalMinor: 80000,
          },
          {
            organizationId: ORG_ID,
            itemType: 'LAB',
            description: 'Diabetes panel',
            quantity: 1,
            unitPriceMinor: 100000,
            taxMinor: 0,
            lineTotalMinor: 100000,
          },
        ],
      },
    },
  });
  await db.payment.create({
    data: {
      organizationId: ORG_ID,
      invoiceId: poojaInvoice.id,
      method: 'CARD',
      amountMinor: 180000,
      reference: 'CARD-5521',
      receivedById: users.billing!,
      createdAt: lastMonth,
    },
  });
  const poojaThread = await db.messageThread.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      subject: 'Do I need to fast before my next blood test?',
    },
  });
  await db.message.createMany({
    data: [
      {
        organizationId: ORG_ID,
        threadId: poojaThread.id,
        senderType: 'PATIENT',
        body: 'Hi, the doctor asked for a repeat HbA1c next month. Should I come fasting?',
        readByStaffAt: new Date(),
      },
      {
        organizationId: ORG_ID,
        threadId: poojaThread.id,
        senderType: 'USER',
        senderUserId: users.reception!,
        body: 'No fasting is needed for HbA1c. Please bring your previous report. See you soon!',
      },
    ],
  });

  // A care plan from last month's visit, a review the clinic asked for, and
  // an in-app alert, so every part of the patient app has something in it.
  const poojaPlan = await db.carePlan.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      encounterId: pastVisit.id,
      title: 'Diabetes and vitamin D care',
      dischargeInstructions:
        'Walk 30 minutes a day. Take Vitamin D3 once a week after a meal. Repeat HbA1c in 3 months.',
      createdById: users.senior!,
      createdAt: lastMonth,
    },
  });
  await db.followUp.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      carePlanId: poojaPlan.id,
      type: 'REVIEW_APPOINTMENT',
      dueAt: new Date(Date.now() + 55 * day),
      createdById: users.senior!,
    },
  });
  await db.reviewRequest.create({
    data: {
      organizationId: ORG_ID,
      patientId: pooja,
      stage: 'AFTER_SECOND_CONSULTATION',
      dedupeKey: 'AFTER_SECOND_CONSULTATION:-',
      expiresAt: new Date(Date.now() + 21 * day),
      requestedById: users.marketing!,
    },
  });
  await db.notification.create({
    data: {
      organizationId: ORG_ID,
      type: 'LAB_RESULT_READY',
      recipientPatientId: pooja,
      title: 'Your test results are ready',
      entityType: 'LabOrder',
      entityId: pastLabs.id,
    },
  });

  // ---- Doctors' weekly hours, so patients can book online (Mon to Sat).
  const hours: Array<[string, string, string, number]> = [
    ['junior', '09:00', '13:00', 15],
    ['senior', '10:00', '13:00', 20],
    ['senior', '16:00', '18:00', 20],
  ];
  for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek += 1) {
    for (const [doctor, startTime, endTime, slotMinutes] of hours) {
      await db.doctorAvailability.create({
        data: {
          organizationId: ORG_ID,
          doctorId: users[doctor]!,
          dayOfWeek,
          startTime,
          endTime,
          slotMinutes,
        },
      });
    }
  }

  console.log(`Demo clinic ready.\n  Clinic ID: ${ORG_ID}\n  Password:  ${PASSWORD}`);
  console.log('  Sign in as: ' + STAFF.map(([key]) => `${key}@demo.local`).join(', '));
  console.log('  Patient app: patient@demo.local (Pooja Deshpande)');
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
