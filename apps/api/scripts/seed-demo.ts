/**
 * Dev-only demo data, so every screen has something real to show for every
 * role. Creates (or resets) one organization, "demo-clinic", with a staff
 * user per role and an evening clinic day that matches the approved Clinical
 * Ink prototype: Dr. Meera Iyer's agenda with Pooja Deshpande (token 012)
 * ready for her, Dr. Rohan Kulkarni's junior desk with two draft notes
 * waiting for a senior signature, and Dr. Arvind Shetty's own patients.
 *
 * Every login uses the same password. NEVER run this against a real
 * database: it deletes everything under the demo-clinic organization (and
 * only that organization) first, so it's safe to re-run.
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
  'clinicHour',
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
  'queueEvent',
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
  ['arvind', 'Dr. Arvind Shetty', StaffRole.SENIOR_DOCTOR],
  ['surgery', 'Vikram Desai', StaffRole.SURGERY_COORDINATOR],
  ['lab', 'Farhan Sheikh', StaffRole.LAB_TECHNICIAN],
  ['pharmacy', 'Deepa Nambiar', StaffRole.PHARMACY],
  ['billing', 'Harish Gupta', StaffRole.BILLING],
  ['insurance', 'Neha Bhatia', StaffRole.INSURANCE],
  ['marketing', 'Arjun Reddy', StaffRole.MARKETING],
];

type Sex = 'FEMALE' | 'MALE';
type PatientKey =
  | 'anil'
  | 'shalini'
  | 'imran'
  | 'kavya'
  | 'vikram'
  | 'neha'
  | 'farida'
  | 'suresh'
  | 'karthik'
  | 'lakshmi'
  | 'divya'
  | 'pooja'
  | 'ritu'
  | 'mohan'
  | 'gopal'
  | 'naveen'
  | 'shreya';

/**
 * [key, first, last, born, phone, sex]. Patient numbers run SM-004801
 * upwards in this order, so Pooja is SM-004812 as in the prototype; the
 * app's allocator (max + 1) carries on from SM-004818.
 */
const PATIENTS: Array<[PatientKey, string, string, string, string, Sex]> = [
  ['anil', 'Anil', 'Kumar', '1968-02-11', '9845011122', 'MALE'],
  ['shalini', 'Shalini', 'Menon', '1985-06-03', '9886022314', 'FEMALE'],
  ['imran', 'Imran', 'Qureshi', '1985-11-02', '9820456718', 'MALE'],
  ['kavya', 'Kavya', 'Rao', '1994-03-18', '9900112233', 'FEMALE'],
  ['vikram', 'Vikram', 'Shetty', '1989-01-22', '9741203398', 'MALE'],
  ['neha', 'Neha', 'Joshi', '2000-04-09', '9922334455', 'FEMALE'],
  ['farida', 'Farida', 'Begum', '1963-12-25', '9848099812', 'FEMALE'],
  ['suresh', 'Suresh', 'Babu', '1957-01-09', '9444201987', 'MALE'],
  ['karthik', 'Karthik', 'Subramanian', '1981-04-07', '9500612347', 'MALE'],
  ['lakshmi', 'Lakshmi', 'Narayanan', '1968-03-14', '9840112233', 'FEMALE'],
  ['divya', 'Divya', 'Chaudhary', '1990-05-30', '9811734562', 'FEMALE'],
  ['pooja', 'Pooja', 'Deshpande', '1992-07-21', '9890123456', 'FEMALE'],
  ['ritu', 'Ritu', 'Malhotra', '1975-05-14', '9873201654', 'FEMALE'],
  ['mohan', 'Mohan', 'Lal Sethi', '1974-09-18', '9810055123', 'MALE'],
  ['gopal', 'Gopal', 'Krishnan', '1949-02-28', '9447123098', 'MALE'],
  ['naveen', 'Naveen', 'Hegde', '1978-06-16', '9448765210', 'MALE'],
  ['shreya', 'Shreya', 'Iyengar', '2001-10-05', '9535123987', 'FEMALE'],
];

type Station = 'VITALS' | 'JUNIOR_DOCTOR' | 'SENIOR_DOCTOR' | 'LAB' | 'BILLING' | 'PHARMACY';
type QStatus = 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'SKIPPED';
type Doctor = 'senior' | 'junior' | 'arvind';

interface Visit {
  patient: PatientKey;
  time: string;
  doctor: Doctor;
  entry: 'ONLINE_BOOKING' | 'RECEPTION_WALK_IN';
  visitType: 'NEW_CONSULTATION' | 'FOLLOW_UP' | 'REPORT_REVIEW';
  /** What the patient wrote when booking (appointment notes). */
  booked?: string;
  /** What reception wrote at check-in (registration notes). */
  checkIn?: string;
  /** Each step of the token's day, oldest first: [station, status, HH:MM]. */
  journey?: Array<[Station, QStatus, string]>;
  /** Not arrived yet. */
  expected?: 'CONFIRMED' | 'REQUESTED';
  /** Visit finished and discharged. */
  closedAt?: string;
  vitals?: {
    at: string;
    bp: [number, number];
    pulse: number;
    spo2: number;
    temp: number;
    heightCm: number;
    weightKg: number;
  };
}

/**
 * Today, in token order. Times are clinic time (IST); the prototype is set
 * at 19:02, with Pooja checked in, seen by the nurse and ready for Dr. Meera.
 */
const DAY: Visit[] = [
  {
    patient: 'anil',
    time: '10:00',
    doctor: 'senior',
    entry: 'ONLINE_BOOKING',
    visitType: 'FOLLOW_UP',
    booked: 'Blood pressure review.',
    journey: [
      ['VITALS', 'WAITING', '09:52'],
      ['VITALS', 'COMPLETED', '09:58'],
      ['SENIOR_DOCTOR', 'WAITING', '09:58'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '10:02'],
      ['SENIOR_DOCTOR', 'COMPLETED', '10:18'],
      ['BILLING', 'WAITING', '10:18'],
      ['BILLING', 'COMPLETED', '10:26'],
    ],
    closedAt: '10:26',
    vitals: {
      at: '09:57',
      bp: [138, 86],
      pulse: 76,
      spo2: 98,
      temp: 36.6,
      heightCm: 172,
      weightKg: 79,
    },
  },
  {
    patient: 'shalini',
    time: '10:20',
    doctor: 'senior',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'NEW_CONSULTATION',
    checkIn: 'Cough for a week',
    journey: [
      ['VITALS', 'WAITING', '10:12'],
      ['VITALS', 'COMPLETED', '10:19'],
      ['SENIOR_DOCTOR', 'WAITING', '10:19'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '10:24'],
      ['SENIOR_DOCTOR', 'COMPLETED', '10:41'],
      ['PHARMACY', 'WAITING', '10:41'],
      ['PHARMACY', 'COMPLETED', '10:55'],
    ],
    closedAt: '10:55',
    vitals: {
      at: '10:18',
      bp: [118, 76],
      pulse: 82,
      spo2: 97,
      temp: 37.4,
      heightCm: 158,
      weightKg: 61,
    },
  },
  {
    patient: 'imran',
    time: '10:30',
    doctor: 'junior',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'NEW_CONSULTATION',
    checkIn: 'Burning stomach pain after meals',
    journey: [
      ['VITALS', 'WAITING', '10:22'],
      ['VITALS', 'COMPLETED', '10:29'],
      ['JUNIOR_DOCTOR', 'WAITING', '10:29'],
      ['JUNIOR_DOCTOR', 'IN_SERVICE', '10:36'],
      ['JUNIOR_DOCTOR', 'COMPLETED', '10:52'],
      ['BILLING', 'WAITING', '10:52'],
    ],
    vitals: {
      at: '10:27',
      bp: [124, 80],
      pulse: 78,
      spo2: 99,
      temp: 36.7,
      heightCm: 176,
      weightKg: 82,
    },
  },
  {
    patient: 'kavya',
    time: '10:40',
    doctor: 'arvind',
    entry: 'ONLINE_BOOKING',
    visitType: 'FOLLOW_UP',
    booked: 'Still feeling weak after the iron course.',
    journey: [
      ['VITALS', 'WAITING', '10:33'],
      ['VITALS', 'COMPLETED', '10:39'],
      ['SENIOR_DOCTOR', 'WAITING', '10:39'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '10:44'],
      ['SENIOR_DOCTOR', 'COMPLETED', '11:02'],
      ['LAB', 'WAITING', '11:02'],
      ['LAB', 'COMPLETED', '11:10'],
      ['BILLING', 'WAITING', '11:10'],
      ['BILLING', 'COMPLETED', '11:16'],
    ],
    closedAt: '11:16',
    vitals: {
      at: '10:38',
      bp: [108, 70],
      pulse: 92,
      spo2: 98,
      temp: 36.8,
      heightCm: 160,
      weightKg: 52,
    },
  },
  {
    patient: 'vikram',
    time: '16:00',
    doctor: 'senior',
    entry: 'ONLINE_BOOKING',
    visitType: 'REPORT_REVIEW',
    booked: 'Ultrasound report review, pain under the right ribs.',
    journey: [
      ['VITALS', 'WAITING', '15:52'],
      ['VITALS', 'COMPLETED', '15:58'],
      ['SENIOR_DOCTOR', 'WAITING', '15:58'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '16:03'],
      ['SENIOR_DOCTOR', 'COMPLETED', '16:24'],
      ['BILLING', 'WAITING', '16:24'],
    ],
    vitals: {
      at: '15:57',
      bp: [126, 82],
      pulse: 74,
      spo2: 99,
      temp: 36.6,
      heightCm: 178,
      weightKg: 84,
    },
  },
  {
    patient: 'neha',
    time: '16:20',
    doctor: 'senior',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'NEW_CONSULTATION',
    checkIn: 'Sneezing and itchy eyes',
    journey: [
      ['VITALS', 'WAITING', '16:14'],
      ['VITALS', 'COMPLETED', '16:20'],
      ['SENIOR_DOCTOR', 'WAITING', '16:20'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '16:26'],
      ['SENIOR_DOCTOR', 'COMPLETED', '16:40'],
      ['PHARMACY', 'WAITING', '16:40'],
    ],
    vitals: {
      at: '16:19',
      bp: [112, 72],
      pulse: 80,
      spo2: 99,
      temp: 36.9,
      heightCm: 163,
      weightKg: 55,
    },
  },
  {
    patient: 'farida',
    time: '18:20',
    doctor: 'senior',
    entry: 'ONLINE_BOOKING',
    visitType: 'FOLLOW_UP',
    booked: 'Knee pain review and sugar check.',
    journey: [['VITALS', 'WAITING', '18:38']],
  },
  {
    patient: 'suresh',
    time: '18:15',
    doctor: 'junior',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'FOLLOW_UP',
    checkIn: 'Headache in the mornings',
    journey: [
      ['VITALS', 'WAITING', '18:20'],
      ['VITALS', 'COMPLETED', '18:28'],
      ['JUNIOR_DOCTOR', 'WAITING', '18:28'],
      ['JUNIOR_DOCTOR', 'CALLED', '18:47'],
      ['JUNIOR_DOCTOR', 'IN_SERVICE', '18:49'],
    ],
    vitals: {
      at: '18:27',
      bp: [152, 94],
      pulse: 84,
      spo2: 97,
      temp: 36.7,
      heightCm: 166,
      weightKg: 71,
    },
  },
  {
    patient: 'karthik',
    time: '18:40',
    doctor: 'arvind',
    entry: 'ONLINE_BOOKING',
    visitType: 'REPORT_REVIEW',
    booked: 'Sugar levels high on the home meter.',
    journey: [
      ['VITALS', 'WAITING', '18:24'],
      ['VITALS', 'COMPLETED', '18:30'],
      ['SENIOR_DOCTOR', 'WAITING', '18:30'],
      ['SENIOR_DOCTOR', 'IN_SERVICE', '18:33'],
      ['SENIOR_DOCTOR', 'COMPLETED', '18:44'],
      ['LAB', 'WAITING', '18:44'],
      ['LAB', 'IN_SERVICE', '18:50'],
    ],
    vitals: {
      at: '18:29',
      bp: [134, 84],
      pulse: 79,
      spo2: 98,
      temp: 36.6,
      heightCm: 170,
      weightKg: 88,
    },
  },
  {
    patient: 'lakshmi',
    time: '18:45',
    doctor: 'junior',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'FOLLOW_UP',
    checkIn: 'Dressing check after the knee wash-out',
    journey: [
      ['VITALS', 'WAITING', '18:44'],
      ['VITALS', 'IN_SERVICE', '18:58'],
    ],
  },
  {
    patient: 'divya',
    time: '18:30',
    doctor: 'junior',
    entry: 'ONLINE_BOOKING',
    visitType: 'NEW_CONSULTATION',
    booked: 'Irregular periods for three months.',
    journey: [
      ['VITALS', 'WAITING', '18:40'],
      ['VITALS', 'COMPLETED', '18:47'],
      ['JUNIOR_DOCTOR', 'WAITING', '18:47'],
    ],
    vitals: {
      at: '18:46',
      bp: [116, 74],
      pulse: 72,
      spo2: 99,
      temp: 36.5,
      heightCm: 161,
      weightKg: 68,
    },
  },
  {
    patient: 'pooja',
    time: '19:00',
    doctor: 'senior',
    entry: 'ONLINE_BOOKING',
    visitType: 'FOLLOW_UP',
    booked: 'Tired all the time, feeling dizzy.',
    checkIn: 'tired, dizzy',
    journey: [
      ['VITALS', 'WAITING', '18:44'],
      ['VITALS', 'IN_SERVICE', '18:48'],
      ['VITALS', 'COMPLETED', '18:56'],
      ['SENIOR_DOCTOR', 'WAITING', '18:56'],
    ],
    vitals: {
      at: '18:52',
      bp: [128, 84],
      pulse: 88,
      spo2: 98,
      temp: 36.8,
      heightCm: 162,
      weightKg: 58,
    },
  },
  {
    patient: 'mohan',
    time: '19:15',
    doctor: 'junior',
    entry: 'ONLINE_BOOKING',
    visitType: 'NEW_CONSULTATION',
    booked: 'Lower back pain after lifting.',
    expected: 'REQUESTED',
  },
  {
    patient: 'ritu',
    time: '19:30',
    doctor: 'senior',
    entry: 'ONLINE_BOOKING',
    visitType: 'NEW_CONSULTATION',
    booked: 'Hot flushes and poor sleep.',
    expected: 'CONFIRMED',
  },
  {
    patient: 'gopal',
    time: '19:40',
    doctor: 'arvind',
    entry: 'RECEPTION_WALK_IN',
    visitType: 'FOLLOW_UP',
    expected: 'CONFIRMED',
  },
];

const DAY_MS = 86_400_000;

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

/** A clinic-local time `days` days ago (negative for the future). */
function daysAgo(days: number, time = '10:00'): Date {
  return new Date(at(time).getTime() - days * DAY_MS);
}

function bmi(heightCm: number, weightKg: number): number {
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

async function main() {
  assertLocalDevOnly('seed-demo.ts');
  const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  const where = { organizationId: ORG_ID };
  const o = { organizationId: ORG_ID };

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
      data: { ...o, email: `${key}@demo.local`, passwordHash, fullName, role },
    });
    users[key] = user.id;
  }
  const u = (key: string) => users[key]!;

  const p = {} as Record<PatientKey, string>;
  for (const [index, [key, firstName, lastName, dob, phone, sex]] of PATIENTS.entries()) {
    const patient = await db.patient.create({
      data: {
        ...o,
        firstName,
        lastName,
        dateOfBirth: new Date(dob),
        phone,
        sex,
        mrn: `SM-${String(4801 + index).padStart(6, '0')}`,
        createdAt: daysAgo(900 - index * 20),
      },
    });
    p[key] = patient.id;
  }
  // Portal logins: Pooja (the prototype's patient) and Kavya.
  await db.patient.update({
    where: { id: p.pooja },
    data: { email: 'patient@demo.local', passwordHash },
  });
  await db.patient.update({
    where: { id: p.kavya },
    data: { email: 'kavya@demo.local', passwordHash },
  });

  // ---- Consultation templates (Pooja's note was started from v2).
  const general = await db.clinicalTemplate.create({
    data: {
      ...o,
      name: 'General consultation',
      noteType: 'CONSULTATION',
      currentVersion: 2,
      createdById: u('admin'),
    },
  });
  await db.clinicalTemplateVersion.create({
    data: {
      ...o,
      templateId: general.id,
      version: 1,
      createdById: u('admin'),
      createdAt: daysAgo(120),
      body: {
        sections: {
          subjective: { prompt: 'Presenting complaint and history, in the patient’s words.' },
          objective: { prompt: 'Examination findings.' },
          assessment: { prompt: 'Working diagnosis.' },
          plan: { prompt: 'Treatment, tests and follow-up.' },
        },
      },
    },
  });
  const generalV2 = await db.clinicalTemplateVersion.create({
    data: {
      ...o,
      templateId: general.id,
      version: 2,
      createdById: u('senior'),
      createdAt: daysAgo(30),
      body: {
        sections: {
          subjective: { prompt: 'Presenting complaint, duration, what makes it better or worse.' },
          objective: { prompt: 'General examination, then the system involved.' },
          assessment: { prompt: 'Working diagnosis and how sure you are.' },
          plan: { prompt: 'Medicines, tests, advice and when to come back.' },
        },
      },
    },
  });
  const diabetes = await db.clinicalTemplate.create({
    data: {
      ...o,
      name: 'Diabetes review',
      noteType: 'CONSULTATION',
      specialty: 'Endocrinology',
      createdById: u('senior'),
    },
  });
  await db.clinicalTemplateVersion.create({
    data: {
      ...o,
      templateId: diabetes.id,
      version: 1,
      createdById: u('senior'),
      body: {
        sections: {
          subjective: { prompt: 'Home sugar readings, hypos, diet and activity.' },
          objective: { prompt: 'Weight, BP, feet and injection sites.' },
          assessment: { defaultText: 'Type 2 diabetes, control ' },
          plan: { prompt: 'Medicines, HbA1c date, eye and foot checks.' },
        },
        fields: [{ key: 'hba1c-target', label: 'HbA1c target (%)', type: 'number' }],
      },
    },
  });

  // ---- Today's clinic day.
  const queueDate = new Date(`${todayIst()}T00:00:00.000Z`);
  const enc = {} as Record<PatientKey, string>;
  const appt = {} as Record<PatientKey, string>;
  let token = 0;

  for (const visit of DAY) {
    const patientId = p[visit.patient];
    const closed = !!visit.closedAt;
    const appointment = await db.appointment.create({
      data: {
        ...o,
        patientId,
        doctorId: u(visit.doctor),
        entrySource: visit.entry,
        status: visit.expected ?? (closed ? 'COMPLETED' : 'CHECKED_IN'),
        scheduledAt: at(visit.time),
        notes: visit.booked,
        createdAt: daysAgo(visit.entry === 'ONLINE_BOOKING' ? 3 : 0, '08:30'),
      },
    });
    appt[visit.patient] = appointment.id;
    if (!visit.journey) continue;

    const checkedIn = at(visit.journey[0]![2]);
    const encounter = await db.encounter.create({
      data: {
        ...o,
        patientId,
        appointmentId: appointment.id,
        status: closed ? 'CLOSED' : 'OPEN',
        startedAt: checkedIn,
        endedAt: closed ? at(visit.closedAt!) : null,
      },
    });
    enc[visit.patient] = encounter.id;
    await db.registration.create({
      data: {
        ...o,
        patientId,
        encounterId: encounter.id,
        visitType: visit.visitType,
        consultationRoute: visit.doctor === 'junior' ? 'JUNIOR_ASSESSMENT' : 'DIRECT_SENIOR',
        idProofVerified: true,
        notes: visit.checkIn,
        registeredById: u('reception'),
        createdAt: checkedIn,
      },
    });

    token += 1;
    const last = visit.journey[visit.journey.length - 1]!;
    const lastWaiting = [...visit.journey].reverse().find((s) => s[1] === 'WAITING')!;
    const called = [...visit.journey]
      .reverse()
      .find((s) => s[0] === last[0] && (s[1] === 'CALLED' || s[1] === 'IN_SERVICE'));
    const entry = await db.queueEntry.create({
      data: {
        ...o,
        patientId,
        encounterId: encounter.id,
        queueDate,
        tokenNumber: token,
        station: last[0],
        status: last[1],
        waitingSince: at(lastWaiting[2]),
        calledAt: called ? at(called[2]) : null,
        completedAt: last[1] === 'COMPLETED' ? at(last[2]) : null,
        createdAt: checkedIn,
      },
    });
    for (const [i, [station, status, time]] of visit.journey.entries()) {
      await db.queueEvent.create({
        data: {
          ...o,
          queueEntryId: entry.id,
          station,
          status,
          at: at(time),
          actorId:
            i === 0
              ? u('reception')
              : station === 'VITALS'
                ? u('nurse')
                : station === 'LAB'
                  ? u('lab')
                  : station === 'BILLING'
                    ? u('billing')
                    : station === 'PHARMACY'
                      ? u('pharmacy')
                      : u(visit.doctor),
        },
      });
    }

    if (visit.vitals) {
      const v = visit.vitals;
      await db.vital.create({
        data: {
          ...o,
          patientId,
          encounterId: encounter.id,
          bloodPressureSystolic: v.bp[0],
          bloodPressureDiastolic: v.bp[1],
          pulseBpm: v.pulse,
          spo2Percent: v.spo2,
          temperatureCelsius: v.temp,
          heightCm: v.heightCm,
          weightKg: v.weightKg,
          bmi: bmi(v.heightCm, v.weightKg),
          recordedAt: at(v.at),
          recordedById: u('nurse'),
        },
      });
    }
  }

  // ---- Earlier visits: Pooja on 5 Sep (32 days ago), Kavya with Dr. Meera
  // three weeks ago, Anil last quarter. These give the timeline, the BP
  // change ("down 8 since Sep"), results and current medication.
  async function pastVisit(
    patient: PatientKey,
    doctor: Doctor,
    days: number,
    time: string,
    reason: string,
    vitals?: Visit['vitals'],
  ) {
    const startedAt = daysAgo(days, time);
    const appointment = await db.appointment.create({
      data: {
        ...o,
        patientId: p[patient],
        doctorId: u(doctor),
        entrySource: 'ONLINE_BOOKING',
        status: 'COMPLETED',
        scheduledAt: startedAt,
        notes: reason,
        createdAt: new Date(startedAt.getTime() - 4 * DAY_MS),
      },
    });
    const encounter = await db.encounter.create({
      data: {
        ...o,
        patientId: p[patient],
        appointmentId: appointment.id,
        status: 'CLOSED',
        startedAt,
        endedAt: new Date(startedAt.getTime() + 50 * 60_000),
      },
    });
    if (vitals) {
      await db.vital.create({
        data: {
          ...o,
          patientId: p[patient],
          encounterId: encounter.id,
          bloodPressureSystolic: vitals.bp[0],
          bloodPressureDiastolic: vitals.bp[1],
          pulseBpm: vitals.pulse,
          spo2Percent: vitals.spo2,
          temperatureCelsius: vitals.temp,
          heightCm: vitals.heightCm,
          weightKg: vitals.weightKg,
          bmi: bmi(vitals.heightCm, vitals.weightKg),
          recordedAt: new Date(startedAt.getTime() - 8 * 60_000),
          recordedById: u('nurse'),
        },
      });
    }
    return { id: encounter.id, at: startedAt };
  }

  const poojaSep = await pastVisit('pooja', 'senior', 32, '11:20', 'Diabetes check-up.', {
    at: '11:12',
    bp: [136, 88],
    pulse: 84,
    spo2: 98,
    temp: 36.7,
    heightCm: 162,
    weightKg: 59,
  });
  const kavyaSep = await pastVisit('kavya', 'senior', 21, '17:00', 'Tiredness and hair fall.', {
    at: '16:52',
    bp: [104, 68],
    pulse: 94,
    spo2: 98,
    temp: 36.6,
    heightCm: 160,
    weightKg: 52,
  });
  const anilJul = await pastVisit('anil', 'senior', 84, '10:00', 'BP check.', {
    at: '09:52',
    bp: [146, 92],
    pulse: 78,
    spo2: 98,
    temp: 36.6,
    heightCm: 172,
    weightKg: 81,
  });

  // ---- Clinical notes. Signed ones are FINALIZED with one version.
  async function note(
    patient: PatientKey,
    encounterId: string,
    author: string,
    soap: { s: string; o: string; a: string; p: string },
    status: 'DRAFT' | 'FINALIZED',
    createdAt: Date,
    templateVersionId?: string,
  ) {
    await db.clinicalNote.create({
      data: {
        ...o,
        patientId: p[patient],
        encounterId,
        noteType: 'CONSULTATION',
        status,
        currentVersionNumber: 1,
        templateVersionId,
        createdAt,
        versions: {
          create: {
            ...o,
            versionNumber: 1,
            status,
            subjective: soap.s,
            objective: soap.o,
            assessment: soap.a,
            plan: soap.p || null,
            authorId: u(author),
            createdAt,
          },
        },
      },
    });
  }

  async function diagnosis(
    patient: PatientKey,
    encounterId: string,
    author: string,
    icdCode: string,
    description: string,
    status: 'DRAFT' | 'FINALIZED',
    createdAt: Date,
  ) {
    await db.diagnosis.create({
      data: {
        ...o,
        patientId: p[patient],
        encounterId,
        status,
        currentVersionNumber: 1,
        createdAt,
        versions: {
          create: { ...o, versionNumber: 1, status, icdCode, description, authorId: u(author) },
        },
      },
    });
  }

  // Pooja today: Dr. Meera's draft, exactly as in the prototype.
  await note(
    'pooja',
    enc.pooja,
    'senior',
    {
      s: 'Tiredness and light-headedness for 3 weeks, worse on standing. Heavy periods last two cycles. No chest pain, no breathlessness at rest. Taking metformin regularly.',
      o: 'Pale conjunctiva. BP 128/84, pulse 88 regular. Chest clear. No pedal oedema.',
      a: 'Suspected iron-deficiency anaemia secondary to menorrhagia. Diabetes control suboptimal (HbA1c 7.8%).',
      p: '',
    },
    'DRAFT',
    at('19:04'),
    generalV2.id,
  );
  await diagnosis(
    'pooja',
    enc.pooja,
    'senior',
    'D50.9',
    'Iron deficiency anaemia',
    'DRAFT',
    at('19:04'),
  );
  // Pooja on 5 Sep.
  await note(
    'pooja',
    poojaSep.id,
    'senior',
    {
      s: 'Routine diabetes review. Feels well. Takes metformin twice daily. Walks three days a week.',
      o: 'BP 136/88. Weight 59 kg. Feet normal.',
      a: 'Type 2 diabetes, control above target. Low vitamin D.',
      p: 'Continue metformin. Vitamin D3 60,000 IU weekly for 8 weeks. Repeat HbA1c in 3 months.',
    },
    'FINALIZED',
    new Date(poojaSep.at.getTime() + 30 * 60_000),
  );
  for (const [code, text] of [
    ['E11.9', 'Type 2 diabetes, without complications'],
    ['E55.9', 'Vitamin D deficiency'],
  ] as const) {
    await diagnosis('pooja', poojaSep.id, 'senior', code, text, 'FINALIZED', poojaSep.at);
  }

  // Dr. Rohan's two junior assessments waiting for a senior signature.
  await note(
    'imran',
    enc.imran,
    'junior',
    {
      s: 'Burning pain in the upper abdomen after meals for 2 weeks. Worse at night. No vomiting, no black stools. Takes painkillers for back pain.',
      o: 'Mild epigastric tenderness. No guarding. BP 124/80.',
      a: 'Likely gastritis, possibly NSAID related.',
      p: 'Pantoprazole 40 mg before breakfast for 4 weeks. Stop painkillers. Review if not better in 2 weeks.',
    },
    'DRAFT',
    at('10:51'),
    generalV2.id,
  );
  await note(
    'suresh',
    enc.suresh,
    'junior',
    {
      s: 'Morning headaches for 10 days. Missed his BP tablets for two weeks while travelling.',
      o: 'BP 152/94, repeat 148/92. Fundi not examined.',
      a: 'Uncontrolled hypertension after missed doses.',
      p: '',
    },
    'DRAFT',
    at('18:58'),
    generalV2.id,
  );

  // Signed notes for the visits already seen today.
  await note(
    'anil',
    enc.anil,
    'senior',
    {
      s: 'BP review. Taking amlodipine daily. No headaches.',
      o: 'BP 138/86, down from 146/92 in July.',
      a: 'Hypertension, improving.',
      p: 'Continue amlodipine 5 mg. Atorvastatin 10 mg at night. Review in 3 months.',
    },
    'FINALIZED',
    at('10:16'),
    generalV2.id,
  );
  await diagnosis(
    'anil',
    enc.anil,
    'senior',
    'I10',
    'Essential hypertension',
    'FINALIZED',
    at('10:16'),
  );
  await note(
    'anil',
    anilJul.id,
    'senior',
    {
      s: 'Headaches on and off.',
      o: 'BP 146/92.',
      a: 'Hypertension.',
      p: 'Start amlodipine 5 mg daily. Low salt diet.',
    },
    'FINALIZED',
    anilJul.at,
  );
  await note(
    'shalini',
    enc.shalini,
    'senior',
    {
      s: 'Dry cough for a week, mild fever two days ago. No breathlessness.',
      o: 'Temp 37.4. Chest clear. Throat congested.',
      a: 'Viral upper respiratory infection.',
      p: 'Paracetamol when needed, steam inhalation, fluids. Come back if fever returns.',
    },
    'FINALIZED',
    at('10:39'),
  );
  await diagnosis(
    'shalini',
    enc.shalini,
    'senior',
    'J06.9',
    'Acute upper respiratory infection',
    'FINALIZED',
    at('10:39'),
  );
  await note(
    'kavya',
    enc.kavya,
    'arvind',
    {
      s: 'Still tired after 6 weeks of oral iron. Periods regular.',
      o: 'Pale. Pulse 92. No organomegaly.',
      a: 'Iron deficiency not responding to oral iron.',
      p: 'Haemoglobin and serum ferritin today. Consider IV iron if ferritin stays low.',
    },
    'FINALIZED',
    at('11:00'),
  );
  await note(
    'kavya',
    kavyaSep.id,
    'senior',
    {
      s: 'Tired for 2 months, hair fall.',
      o: 'Pale conjunctiva.',
      a: 'Probable iron deficiency.',
      p: 'Ferrous ascorbate 100 mg daily for 6 weeks.',
    },
    'FINALIZED',
    kavyaSep.at,
  );
  await diagnosis(
    'kavya',
    kavyaSep.id,
    'senior',
    'D50.9',
    'Iron deficiency anaemia',
    'FINALIZED',
    kavyaSep.at,
  );
  await note(
    'vikram',
    enc.vikram,
    'senior',
    {
      s: 'Pain under the right ribs after fatty meals for 2 months.',
      o: 'Tender right upper abdomen. Ultrasound: multiple gallstones, wall normal.',
      a: 'Symptomatic gallstones.',
      p: 'Laparoscopic cholecystectomy planned. Pre-operative tests. Low fat diet meanwhile.',
    },
    'FINALIZED',
    at('16:22'),
  );
  await diagnosis(
    'vikram',
    enc.vikram,
    'senior',
    'K80.20',
    'Gallstones without obstruction',
    'FINALIZED',
    at('16:22'),
  );
  await note(
    'neha',
    enc.neha,
    'senior',
    {
      s: 'Sneezing, runny nose and itchy eyes every morning for a month.',
      o: 'Pale swollen nasal lining. Chest clear.',
      a: 'Allergic rhinitis.',
      p: 'Cetirizine 10 mg at night for 2 weeks. Avoid dust.',
    },
    'FINALIZED',
    at('16:38'),
  );
  await note(
    'karthik',
    enc.karthik,
    'arvind',
    {
      s: 'Home sugar readings 180 to 220 after meals.',
      o: 'BMI 30.4. BP 134/84.',
      a: 'Type 2 diabetes, poorly controlled.',
      p: 'HbA1c and lipid profile today, then review.',
    },
    'FINALIZED',
    at('18:42'),
  );

  // ---- Medical history.
  await db.medicalHistoryEntry.createMany({
    data: [
      {
        ...o,
        patientId: p.pooja,
        category: 'ALLERGY',
        description: 'Penicillin (rash)',
        severity: 'MODERATE',
        recordedById: u('nurse'),
        createdAt: daysAgo(500),
      },
      {
        ...o,
        patientId: p.pooja,
        category: 'CONDITION',
        description: 'Type 2 diabetes',
        recordedById: u('nurse'),
        createdAt: daysAgo(500),
      },
      {
        ...o,
        patientId: p.pooja,
        category: 'CONDITION',
        description: 'Vitamin D deficiency',
        recordedById: u('senior'),
        createdAt: poojaSep.at,
      },
      {
        ...o,
        patientId: p.pooja,
        category: 'FAMILY_HISTORY',
        description: 'Father: heart disease',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.anil,
        category: 'CONDITION',
        description: 'Hypertension',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.anil,
        category: 'CURRENT_MEDICATION',
        description: 'Amlodipine 5 mg once daily',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.farida,
        category: 'ALLERGY',
        description: 'Sulfa drugs (hives)',
        severity: 'SEVERE',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.farida,
        category: 'CONDITION',
        description: 'Osteoarthritis of both knees',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.karthik,
        category: 'CONDITION',
        description: 'Type 2 diabetes',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.suresh,
        category: 'CONDITION',
        description: 'Hypertension',
        recordedById: u('nurse'),
      },
      {
        ...o,
        patientId: p.kavya,
        category: 'CONDITION',
        description: 'Iron deficiency anaemia',
        recordedById: u('senior'),
      },
    ],
  });

  // ---- Prescriptions.
  async function prescribe(
    patient: PatientKey,
    encounterId: string,
    author: string,
    createdAt: Date,
    items: Array<[string, string, string, number | null, string?]>,
  ) {
    return db.prescription.create({
      data: {
        ...o,
        patientId: p[patient],
        encounterId,
        authorId: u(author),
        createdAt,
        items: {
          create: items.map(([medicationName, dosage, frequency, durationDays, instructions]) => ({
            ...o,
            medicationName,
            dosage,
            frequency,
            durationDays,
            instructions,
          })),
        },
      },
    });
  }
  // Pooja's running medicines (shown as Current medication today) and
  // today's prescription from the prototype.
  await prescribe('pooja', poojaSep.id, 'senior', poojaSep.at, [
    ['Metformin 500 mg', '1 tablet', 'Twice daily', 180],
    ['Vitamin D3 60,000 IU', '1 sachet', 'Weekly', 56, 'Mix in milk or water, after a meal.'],
  ]);
  await prescribe('pooja', enc.pooja, 'senior', at('19:05'), [
    ['Ferrous ascorbate 100 mg', '1 tablet', 'Once daily after food', 90],
    ['Paracetamol 650 mg', '1 tablet', 'When needed, max 3 a day', 5],
  ]);
  await prescribe('anil', enc.anil, 'senior', at('10:17'), [
    ['Amlodipine 5 mg', '1 tablet', 'Once daily', 90],
    ['Atorvastatin 10 mg', '1 tablet', 'At night', 90],
  ]);
  await prescribe('shalini', enc.shalini, 'senior', at('10:40'), [
    ['Paracetamol 650 mg', '1 tablet', 'When needed, max 3 a day', 5],
  ]);
  await prescribe('kavya', kavyaSep.id, 'senior', kavyaSep.at, [
    ['Ferrous ascorbate 100 mg', '1 tablet', 'Once daily after food', 42],
  ]);
  // Waiting at the pharmacy.
  await prescribe('neha', enc.neha, 'senior', at('16:39'), [
    ['Cetirizine 10 mg', '1 tablet', 'At night', 14],
  ]);
  await prescribe('vikram', enc.vikram, 'senior', at('16:23'), [
    ['Pantoprazole 40 mg', '1 tablet', 'Before breakfast', 14],
    ['Paracetamol 650 mg', '1 tablet', 'When needed, max 3 a day', 5],
  ]);
  await prescribe('imran', enc.imran, 'junior', at('10:52'), [
    ['Pantoprazole 40 mg', '1 tablet', 'Before breakfast', 28],
  ]);

  // ---- Pharmacy catalogue and stock (one batch near expiry, one running low).
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
    ['Amlodipine', 'TABLET', '5 mg', 'tablet', 400, 150, [['AML-2503', 420, 1.4]]],
    ['Amoxicillin', 'CAPSULE', '500 mg', 'capsule', 1200, 100, [['AMX-2408', 60, 0.04]]],
    ['Pantoprazole', 'TABLET', '40 mg', 'tablet', 700, 120, [['PAN-2503', 500, 1.5]]],
    ['Paracetamol', 'TABLET', '650 mg', 'tablet', 200, 300, [['PCM-2501', 1200, 2.0]]],
    ['Cetirizine', 'TABLET', '10 mg', 'tablet', 250, 100, [['CET-2410', 90, 0.07]]],
    ['Ferrous ascorbate', 'TABLET', '100 mg', 'tablet', 1100, 120, [['FER-2504', 85, 1.1]]],
    ['Vitamin D3', 'OTHER', '60,000 IU', 'sachet', 4500, 30, [['VD3-2502', 140, 0.9]]],
  ];
  for (const [name, form, strength, unit, price, reorder, batches] of medicines) {
    const medication = await db.medication.create({
      data: {
        ...o,
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
          ...o,
          medicationId: medication.id,
          batchNumber,
          expiryDate: new Date(Date.now() + years * 365 * DAY_MS),
          quantityReceived: qty + 40,
          quantityOnHand: qty,
          receivedById: u('pharmacy'),
        },
      });
    }
  }

  // ---- Lab orders and results.
  async function labs(
    patient: PatientKey,
    encounterId: string,
    author: string,
    orderedAt: Date,
    tests: Array<[string, [string, string, string, Date]?]>,
  ) {
    const order = await db.labOrder.create({
      data: {
        ...o,
        patientId: p[patient],
        encounterId,
        authorId: u(author),
        createdAt: orderedAt,
        items: { create: tests.map(([testName]) => ({ ...o, testName })) },
      },
      include: { items: true },
    });
    for (const [i, [, result]] of tests.entries()) {
      if (!result) continue;
      const [resultValue, unit, referenceRange, createdAt] = result;
      await db.labResult.create({
        data: {
          ...o,
          labOrderItemId: order.items[i]!.id,
          resultValue,
          unit,
          referenceRange,
          enteredById: u('lab'),
          createdAt,
        },
      });
    }
    return order;
  }
  const sepResults = new Date(poojaSep.at.getTime() + 5 * 60 * 60_000);
  const poojaSepLabs = await labs('pooja', poojaSep.id, 'senior', poojaSep.at, [
    ['HbA1c', ['7.8', '%', '4.0 to 5.6', sepResults]],
    ['Vitamin D (25-OH)', ['18', 'ng/mL', '30 to 100', sepResults]],
  ]);
  await labs('pooja', enc.pooja, 'senior', at('19:05'), [['Haemoglobin'], ['Serum ferritin']]);
  // Kavya's ferritin came back low this evening: it is on Dr. Meera's
  // "Needs your signature" row because she saw Kavya three weeks ago.
  await labs('kavya', enc.kavya, 'arvind', at('11:01'), [
    ['Haemoglobin', ['10.8', 'g/dL', '12.0 to 15.5', at('18:39')]],
    ['Serum ferritin', ['9', 'ng/mL', '15 to 150', at('18:40')]],
  ]);
  await labs('kavya', kavyaSep.id, 'senior', kavyaSep.at, [
    [
      'Haemoglobin',
      ['10.2', 'g/dL', '12.0 to 15.5', new Date(kavyaSep.at.getTime() + 4 * 3_600_000)],
    ],
  ]);
  await labs('karthik', enc.karthik, 'arvind', at('18:43'), [
    ['HbA1c', ['8.9', '%', '4.0 to 5.6', at('18:57')]],
    ['Lipid profile'],
  ]);
  await labs('vikram', enc.vikram, 'senior', at('16:23'), [
    ['Complete blood count', ['13.9', 'g/dL', '13.0 to 17.0', at('16:50')]],
    ['Liver function test'],
  ]);
  await labs('anil', anilJul.id, 'senior', anilJul.at, [
    [
      'Lipid profile (LDL)',
      ['142', 'mg/dL', '0 to 100', new Date(anilJul.at.getTime() + 3_600_000)],
    ],
  ]);

  // ---- Referrals: Dr. Rohan's urgent one for Pooja (prototype), one to Dr. Arvind.
  await db.referral.create({
    data: {
      ...o,
      patientId: p.pooja,
      encounterId: enc.pooja,
      type: 'INTERNAL',
      toUserId: u('senior'),
      reason: 'Knee pain',
      urgency: 'URGENT',
      referredById: u('junior'),
      createdAt: at('18:58'),
    },
  });
  await db.referral.create({
    data: {
      ...o,
      patientId: p.suresh,
      encounterId: enc.suresh,
      type: 'INTERNAL',
      toUserId: u('arvind'),
      reason: 'BP not controlled on two medicines',
      urgency: 'ROUTINE',
      referredById: u('junior'),
      createdAt: at('18:59'),
    },
  });
  await db.referral.create({
    data: {
      ...o,
      patientId: p.vikram,
      encounterId: enc.vikram,
      type: 'EXTERNAL',
      toName: 'Dr. S. Hegde',
      toFacility: 'Manipal Hospital, Old Airport Road',
      toSpecialty: 'Anaesthesia',
      reason: 'Pre-anaesthetic check before cholecystectomy',
      urgency: 'ROUTINE',
      referredById: u('senior'),
      createdAt: at('16:23'),
    },
  });

  // ---- Surgery being planned for Vikram.
  await db.procedure.create({
    data: {
      ...o,
      patientId: p.vikram,
      encounterId: enc.vikram,
      kind: 'SURGERY',
      name: 'Laparoscopic cholecystectomy',
      estimateMinor: 8500000,
      createdById: u('senior'),
      checklist: {
        create: [
          { ...o, label: 'Fasting from midnight' },
          { ...o, label: 'Blood grouping done' },
          { ...o, label: 'Anaesthesia review' },
          { ...o, label: 'Consent signed' },
        ],
      },
    },
  });

  // ---- Invoices.
  let invoiceNumber = 0;
  async function invoice(
    patient: PatientKey,
    lines: Array<[string, 'CONSULTATION' | 'LAB' | 'PHARMACY', number]>,
    paid: number,
    method: 'UPI' | 'CASH' | 'CARD',
    createdAt: Date,
  ) {
    invoiceNumber += 1;
    const total = lines.reduce((n, [, , amount]) => n + amount, 0);
    const created = await db.invoice.create({
      data: {
        ...o,
        number: invoiceNumber,
        patientId: p[patient],
        status: paid === total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        subtotalMinor: total,
        taxMinor: 0,
        totalMinor: total,
        paidMinor: paid,
        issuedById: u('billing'),
        createdAt,
        items: {
          create: lines.map(([description, itemType, amount]) => ({
            ...o,
            itemType,
            description,
            quantity: 1,
            unitPriceMinor: amount,
            taxMinor: 0,
            lineTotalMinor: amount,
          })),
        },
      },
    });
    if (paid > 0) {
      await db.payment.create({
        data: {
          ...o,
          invoiceId: created.id,
          method,
          amountMinor: paid,
          reference: method === 'CASH' ? undefined : `${method}-${4400 + invoiceNumber}`,
          receivedById: u('billing'),
          createdAt,
        },
      });
    }
  }
  await invoice(
    'pooja',
    [
      ['OPD consultation', 'CONSULTATION', 80000],
      ['Diabetes panel', 'LAB', 100000],
    ],
    180000,
    'CARD',
    poojaSep.at,
  );
  await invoice('anil', [['OPD consultation', 'CONSULTATION', 80000]], 80000, 'UPI', at('10:26'));
  await invoice(
    'kavya',
    [
      ['OPD consultation', 'CONSULTATION', 80000],
      ['Haemoglobin and ferritin', 'LAB', 65000],
    ],
    145000,
    'UPI',
    at('11:16'),
  );
  await invoice(
    'shalini',
    [
      ['OPD consultation', 'CONSULTATION', 60000],
      ['Paracetamol 650 mg x 10', 'PHARMACY', 2000],
    ],
    62000,
    'CASH',
    at('10:55'),
  );
  await invoice(
    'imran',
    [['OPD consultation (junior)', 'CONSULTATION', 50000]],
    0,
    'CASH',
    at('10:52'),
  );
  await invoice(
    'vikram',
    [
      ['OPD consultation', 'CONSULTATION', 80000],
      ['CBC and LFT', 'LAB', 120000],
    ],
    100000,
    'CASH',
    at('16:25'),
  );

  // ---- Care plans and follow-ups.
  const poojaPlan = await db.carePlan.create({
    data: {
      ...o,
      patientId: p.pooja,
      encounterId: poojaSep.id,
      title: 'Diabetes and vitamin D care',
      dischargeInstructions:
        'Walk 30 minutes a day. Take Vitamin D3 once a week after a meal. Repeat HbA1c in 3 months.',
      createdById: u('senior'),
      createdAt: poojaSep.at,
    },
  });
  const anilPlan = await db.carePlan.create({
    data: {
      ...o,
      patientId: p.anil,
      encounterId: enc.anil,
      title: 'Blood pressure control',
      dischargeInstructions: 'Amlodipine every morning. Less salt. Check BP at home twice a week.',
      createdById: u('senior'),
      createdAt: at('10:20'),
    },
  });
  await db.followUp.createMany({
    data: [
      {
        ...o,
        patientId: p.pooja,
        carePlanId: poojaPlan.id,
        type: 'REVIEW_APPOINTMENT',
        dueAt: new Date(Date.now() + 55 * DAY_MS),
        createdById: u('senior'),
      },
      {
        ...o,
        patientId: p.anil,
        carePlanId: anilPlan.id,
        type: 'RECOVERY_CHECK',
        dueAt: at('17:00'),
        createdById: u('senior'),
        assignedToId: u('nurse'),
      },
      {
        ...o,
        patientId: p.suresh,
        type: 'MEDICATION_REMINDER',
        dueAt: at('20:00'),
        createdById: u('junior'),
        assignedToId: u('nurse'),
      },
      {
        ...o,
        patientId: p.farida,
        type: 'REVIEW_APPOINTMENT',
        dueAt: daysAgo(2),
        createdById: u('senior'),
      },
      {
        ...o,
        patientId: p.kavya,
        type: 'REPORT_ALERT',
        dueAt: daysAgo(-1, '11:00'),
        createdById: u('arvind'),
        assignedToId: u('nurse'),
      },
    ],
  });

  // Pooja's next visit (the patient app's "Next visit") and a couple of
  // future bookings so the schedule pages have tomorrow too.
  await db.appointment.createMany({
    data: [
      {
        ...o,
        patientId: p.pooja,
        doctorId: u('senior'),
        entrySource: 'ONLINE_BOOKING',
        status: 'CONFIRMED',
        scheduledAt: daysAgo(-6, '10:20'),
        notes: 'Review of the blood tests.',
      },
      {
        ...o,
        patientId: p.shreya,
        doctorId: u('junior'),
        entrySource: 'ONLINE_BOOKING',
        status: 'REQUESTED',
        scheduledAt: daysAgo(-1, '09:30'),
        notes: 'Acne on the face and back.',
      },
      {
        ...o,
        patientId: p.naveen,
        doctorId: u('senior'),
        entrySource: 'RECEPTION_WALK_IN',
        status: 'CONFIRMED',
        scheduledAt: daysAgo(-1, '16:40'),
      },
      {
        ...o,
        patientId: p.naveen,
        doctorId: u('senior'),
        entrySource: 'ONLINE_BOOKING',
        status: 'NO_SHOW',
        scheduledAt: daysAgo(14, '17:00'),
      },
    ],
  });

  // ---- Notifications.
  await db.notification.createMany({
    data: [
      {
        ...o,
        type: 'PHARMACY_PREPARE',
        recipientRole: 'PHARMACY',
        title: 'Prescription ready to prepare: Neha Joshi',
        entityType: 'Prescription',
      },
      {
        ...o,
        type: 'GENERAL',
        recipientRole: 'RECEPTION',
        title: 'Two online bookings for tomorrow are waiting to be confirmed.',
      },
      {
        ...o,
        type: 'LAB_RESULT_READY',
        recipientPatientId: p.pooja,
        title: 'Your test results are ready',
        entityType: 'LabOrder',
        entityId: poojaSepLabs.id,
        createdAt: sepResults,
      },
    ],
  });

  // ---- Messages.
  const poojaThread = await db.messageThread.create({
    data: { ...o, patientId: p.pooja, subject: 'Do I need to fast before my next blood test?' },
  });
  await db.message.createMany({
    data: [
      {
        ...o,
        threadId: poojaThread.id,
        senderType: 'PATIENT',
        body: 'Hi, the doctor asked for a repeat HbA1c next month. Should I come fasting?',
        readByStaffAt: daysAgo(2, '10:30'),
        createdAt: daysAgo(2, '10:12'),
      },
      {
        ...o,
        threadId: poojaThread.id,
        senderType: 'USER',
        senderUserId: u('reception'),
        body: 'No fasting is needed for HbA1c. Please bring your previous report.',
        createdAt: daysAgo(2, '11:40'),
      },
    ],
  });
  const divyaThread = await db.messageThread.create({
    data: { ...o, patientId: p.divya, subject: 'Can I move my appointment to Friday?' },
  });
  await db.message.create({
    data: {
      ...o,
      threadId: divyaThread.id,
      senderType: 'PATIENT',
      body: 'Hello, I have a meeting on Thursday. Is there any slot on Friday morning?',
      createdAt: at('09:12'),
    },
  });
  const kavyaThread = await db.messageThread.create({
    data: { ...o, patientId: p.kavya, subject: 'Are my blood test results out?' },
  });
  await db.message.create({
    data: {
      ...o,
      threadId: kavyaThread.id,
      senderType: 'PATIENT',
      body: 'I gave blood this morning. When will the ferritin result come?',
      createdAt: at('15:20'),
    },
  });

  // ---- Marketing: two campaigns and a spread of leads.
  const camp = await db.campaign.create({
    data: {
      ...o,
      name: 'Diabetes awareness camp',
      type: 'HEALTH_CAMP',
      status: 'ACTIVE',
      location: 'Indiranagar Community Hall',
      startsAt: new Date(Date.now() + 9 * DAY_MS),
      createdById: u('marketing'),
    },
  });
  const social = await db.campaign.create({
    data: {
      ...o,
      name: 'Winter wellness packages',
      type: 'DIGITAL',
      channel: 'Instagram',
      status: 'ACTIVE',
      createdById: u('marketing'),
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
    ['Sanjay', 'Pai', '9880076543', 'CAMPAIGN', 'CONTACTED', camp.id, true],
    ['Priya', 'Nair', '9845098765', 'WEBSITE', 'NEW', null, true],
  ];
  for (const [firstName, lastName, phone, source, status, campaignId, consent] of leads) {
    await db.lead.create({
      data: {
        ...o,
        firstName,
        lastName,
        phone,
        source: source as 'WEBSITE',
        status,
        campaignId,
        ownerId: u('marketing'),
        consentToContact: consent,
        consentRecordedAt: consent ? new Date() : null,
        enquiry: status === 'NEW' ? 'Asked about a full-body health check.' : null,
        nextFollowUpAt: status === 'CONTACTED' ? at('16:30') : null,
        lostReason: status === 'LOST' ? 'Chose a clinic closer to home.' : null,
      },
    });
  }

  // ---- Insurance: Vikram's surgery at the pre-authorisation stage.
  const policy = await db.insurancePolicy.create({
    data: {
      ...o,
      patientId: p.vikram,
      insurerName: 'Star Health',
      policyNumber: 'P/151313/01/2026/008812',
      memberId: 'SH-2290417',
      sumInsuredMinor: 50000000,
    },
  });
  const insuranceCase = await db.insuranceCase.create({
    data: {
      ...o,
      patientId: p.vikram,
      policyId: policy.id,
      status: 'PRE_AUTH_REQUESTED',
      requestedAmountMinor: 8500000,
      preAuthReference: 'PA-77120',
      createdById: u('insurance'),
    },
  });
  await db.insuranceCaseEvent.createMany({
    data: [
      {
        ...o,
        caseId: insuranceCase.id,
        toStatus: 'ELIGIBILITY_CHECK',
        actorId: u('insurance'),
        createdAt: at('16:40'),
      },
      {
        ...o,
        caseId: insuranceCase.id,
        fromStatus: 'ELIGIBILITY_CHECK',
        toStatus: 'PRE_AUTH_REQUESTED',
        amountMinor: 8500000,
        actorId: u('insurance'),
        note: 'Pre-authorisation form sent to the TPA.',
        createdAt: at('17:15'),
      },
    ],
  });

  // ---- Reviews: one waiting for moderation, one asked of Pooja.
  const anilRequest = await db.reviewRequest.create({
    data: {
      ...o,
      patientId: p.anil,
      stage: 'AFTER_SECOND_CONSULTATION',
      dedupeKey: 'AFTER_SECOND_CONSULTATION:-',
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
      requestedById: u('marketing'),
    },
  });
  await db.review.create({
    data: {
      ...o,
      patientId: p.anil,
      requestId: anilRequest.id,
      stage: 'AFTER_SECOND_CONSULTATION',
      rating: 5,
      comment: 'Dr. Meera explained everything clearly and the waiting time was short.',
      publishConsent: true,
    },
  });
  await db.reviewRequest.create({
    data: {
      ...o,
      patientId: p.pooja,
      stage: 'AFTER_SECOND_CONSULTATION',
      dedupeKey: 'AFTER_SECOND_CONSULTATION:-',
      expiresAt: new Date(Date.now() + 21 * DAY_MS),
      requestedById: u('marketing'),
    },
  });

  // ---- Tasks.
  await db.staffTask.createMany({
    data: [
      {
        ...o,
        title: 'Call Mr. Kumar about his home BP readings',
        assigneeId: u('nurse'),
        createdById: u('senior'),
        priority: 'HIGH',
        dueAt: at('17:00'),
      },
      {
        ...o,
        title: 'Reorder Ferrous ascorbate 100 mg',
        assigneeId: u('pharmacy'),
        createdById: u('admin'),
        priority: 'NORMAL',
        dueAt: new Date(Date.now() + 2 * DAY_MS),
      },
      {
        ...o,
        title: "Confirm tomorrow's online bookings",
        assigneeId: u('reception'),
        createdById: u('reception'),
        priority: 'NORMAL',
        dueAt: at('20:00'),
      },
      {
        ...o,
        title: 'Book the anaesthesia review for Vikram Shetty',
        assigneeId: u('surgery'),
        createdById: u('senior'),
        priority: 'HIGH',
        dueAt: daysAgo(-1, '12:00'),
      },
    ],
  });

  // ---- Doctors' weekly hours (Mon to Sat): 10:00 to 13:00 and 16:00 to 20:00.
  const hours: Array<[Doctor, string, string, number]> = [
    ['senior', '10:00', '13:00', 20],
    ['senior', '16:00', '20:00', 20],
    ['arvind', '10:00', '13:00', 20],
    ['arvind', '16:00', '20:00', 20],
    ['junior', '09:00', '13:00', 15],
    ['junior', '16:00', '20:00', 15],
  ];
  for (let dayOfWeek = 1; dayOfWeek <= 6; dayOfWeek += 1) {
    for (const [doctor, startTime, endTime, slotMinutes] of hours) {
      await db.doctorAvailability.create({
        data: { ...o, doctorId: u(doctor), dayOfWeek, startTime, endTime, slotMinutes },
      });
    }
  }

  // ---- Clinic opening hours: Mon to Sat, 09:00 to 20:00 (Sunday closed).
  await db.clinicHour.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      ...o,
      dayOfWeek,
      opensAt: '09:00',
      closesAt: '20:00',
    })),
  });

  console.log(`Demo clinic ready.\n  Clinic ID: ${ORG_ID}\n  Password:  ${PASSWORD}`);
  console.log('  Sign in as: ' + STAFF.map(([key]) => `${key}@demo.local`).join(', '));
  console.log('  Patient app: patient@demo.local (Pooja Deshpande), kavya@demo.local (Kavya Rao)');
  void appt;
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
