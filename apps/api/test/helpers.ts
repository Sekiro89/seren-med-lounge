import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Shared setup for the suites added with the 2026-10 backend build.
 * Older suites keep their own inline setup.
 */

/** Every organization-scoped model, children before parents (FK-safe delete order). */
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

export async function wipeOrgs(admin: PrismaClient, orgIds: string[]) {
  const where = { organizationId: { in: orgIds } };
  for (const model of WIPE_ORDER) {
    const delegate = (
      admin as unknown as Record<string, { deleteMany?: (a: object) => Promise<unknown> }>
    )[model];
    if (delegate?.deleteMany) {
      await delegate.deleteMany({ where });
    }
  }
  await admin.organization.deleteMany({ where: { id: { in: orgIds } } });
}

export interface StaffSeed {
  key: string;
  organizationId: string;
  role: StaffRole;
}

export interface TestContext {
  app: INestApplication;
  admin: PrismaClient;
  /** staff key -> user id */
  ids: Record<string, string>;
  /** staff key -> bearer header */
  as: (key: string) => { Authorization: string };
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export const TEST_PASSWORD = 'e2e-shared-password';

/**
 * Wipes and recreates the given orgs, seeds one staff user per entry
 * (email `${key}@${orgId}.example.com`), boots the app and logs them all in.
 */
export async function setupContext(
  orgs: Array<{ id: string; name: string }>,
  staff: StaffSeed[],
): Promise<TestContext> {
  const admin = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });
  await wipeOrgs(
    admin,
    orgs.map((o) => o.id),
  );
  for (const org of orgs) {
    await admin.organization.create({ data: org });
  }

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const ids: Record<string, string> = {};
  for (const s of staff) {
    const user = await admin.user.create({
      data: {
        organizationId: s.organizationId,
        email: `${s.key}@${s.organizationId}.example.com`,
        passwordHash,
        fullName: s.key,
        role: s.role,
      },
    });
    ids[s.key] = user.id;
  }

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();

  const tokens: Record<string, string> = {};
  for (const s of staff) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        organizationId: s.organizationId,
        email: `${s.key}@${s.organizationId}.example.com`,
        password: TEST_PASSWORD,
      });
    tokens[s.key] = res.body.accessToken;
  }

  return {
    app,
    admin,
    ids,
    as: (key) => ({ Authorization: `Bearer ${tokens[key]}` }),
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await admin.$disconnect();
    },
  };
}

/** Creates a patient with portal credentials and returns its id and a patient bearer header. */
export async function createPatientWithLogin(
  ctx: TestContext,
  organizationId: string,
  overrides: { email: string; phone: string; firstName?: string },
) {
  const patient = await ctx.admin.patient.create({
    data: {
      organizationId,
      firstName: overrides.firstName ?? 'Test',
      lastName: 'Patient',
      dateOfBirth: new Date('1985-05-05'),
      phone: overrides.phone,
      email: overrides.email,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
  const res = await ctx
    .http()
    .post('/auth/patient/login')
    .send({ organizationId, email: overrides.email, password: TEST_PASSWORD })
    .expect(201);
  return { id: patient.id, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

/** Books and checks in an appointment; returns the encounter id. */
export async function checkedInEncounter(ctx: TestContext, who: string, patientId: string) {
  const appt = await ctx
    .http()
    .post('/appointments')
    .set(ctx.as(who))
    .send({ patientId, entrySource: 'RECEPTION_WALK_IN', scheduledAt: new Date().toISOString() })
    .expect(201);
  const encounter = await ctx
    .http()
    .post(`/appointments/${appt.body.id}/check-in`)
    .set(ctx.as(who))
    .expect(201);
  return encounter.body.id as string;
}
