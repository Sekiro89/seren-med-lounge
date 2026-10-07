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
    await db.invoice.create({
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

  console.log(`Demo clinic ready.\n  Clinic ID: ${ORG_ID}\n  Password:  ${PASSWORD}`);
  console.log('  Sign in as: ' + STAFF.map(([key]) => `${key}@demo.local`).join(', '));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
