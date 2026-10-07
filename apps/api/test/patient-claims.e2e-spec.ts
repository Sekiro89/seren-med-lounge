import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * The staff-facing side of the Patient Record Claim Rules
 * (docs/architecture/open-questions.md#3): resolving a
 * PatientClaimRequest a self-signup couldn't confidently match on its
 * own. See patient-auth.e2e-spec.ts's "Patient Record Claim Rules"
 * describe block for the matching/auto-link cases this suite doesn't
 * re-cover — this one is scoped to /patient-claims itself: listing,
 * link/create-new/reject, and the permission boundary.
 */
describe('Patient claims (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const org = { id: 'e2e-claims-org', name: 'E2E Claims Org' };
  const receptionPassword = 'reception-e2e-password';
  const nursePassword = 'nurse-e2e-password'; // no patient:write

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    const orgFilter = { organizationId: org.id };
    await admin.auditLog.deleteMany({ where: orgFilter });
    await admin.patientClaimRequest.deleteMany({ where: orgFilter });
    await admin.patient.deleteMany({ where: orgFilter });
    await admin.user.deleteMany({ where: orgFilter });
    await admin.organization.deleteMany({ where: { id: org.id } });

    await admin.organization.create({ data: org });

    await admin.user.create({
      data: {
        organizationId: org.id,
        email: 'reception@e2e-claims.example.com',
        passwordHash: await bcrypt.hash(receptionPassword, 4),
        fullName: 'E2E Reception',
        role: StaffRole.RECEPTION,
      },
    });
    await admin.user.create({
      data: {
        organizationId: org.id,
        email: 'nurse@e2e-claims.example.com',
        passwordHash: await bcrypt.hash(nursePassword, 4),
        fullName: 'E2E Nurse',
        role: StaffRole.NURSE,
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await admin.$disconnect();
  });

  async function staffLogin(email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId: org.id, email, password });
    return res.body.accessToken as string;
  }

  async function createAmbiguousClaim(phone: string) {
    const original = await admin.patient.create({
      data: {
        organizationId: org.id,
        firstName: 'Existing',
        lastName: 'Record',
        dateOfBirth: new Date('1980-01-01'),
        phone,
      },
    });

    const signupRes = await request(app.getHttpServer())
      .post('/auth/patient/signup')
      .send({
        organizationId: org.id,
        firstName: 'Different',
        lastName: 'Name',
        dateOfBirth: '1980-01-01',
        phone,
        email: `claim-${phone}@e2e.example.com`,
        password: 'a-real-password-123',
      })
      .expect(201);
    expect(signupRes.body).toEqual({ status: 'pending_verification' });

    const claim = await admin.patientClaimRequest.findFirstOrThrow({
      where: { organizationId: org.id, phone },
    });
    return { claim, original };
  }

  it('a role without patient:write is rejected with 403 on every route', async () => {
    const token = await staffLogin('nurse@e2e-claims.example.com', nursePassword);
    await request(app.getHttpServer())
      .get('/patient-claims')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/patient-claims/does-not-matter/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });

  it('lists pending claims with their candidate patient(s) embedded', async () => {
    const { claim, original } = await createAmbiguousClaim('5559990001');
    const token = await staffLogin('reception@e2e-claims.example.com', receptionPassword);

    const res = await request(app.getHttpServer())
      .get('/patient-claims')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const listed = res.body.find((c: { id: string }) => c.id === claim.id);
    expect(listed).toBeDefined();
    expect(listed.candidates).toEqual([expect.objectContaining({ id: original.id })]);
  });

  it('linking a claim sets credentials on the existing record — no duplicate — and the patient can then log in', async () => {
    const { claim, original } = await createAmbiguousClaim('5559990002');
    const token = await staffLogin('reception@e2e-claims.example.com', receptionPassword);

    const linkRes = await request(app.getHttpServer())
      .post(`/patient-claims/${claim.id}/link`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: original.id })
      .expect(201);
    expect(linkRes.body.id).toBe(original.id);

    const rowCount = await admin.patient.count({
      where: { organizationId: org.id, phone: '5559990002' },
    });
    expect(rowCount).toBe(1);

    const login = await request(app.getHttpServer())
      .post('/auth/patient/login')
      .send({ organizationId: org.id, email: claim.email, password: 'a-real-password-123' })
      .expect(201);
    expect(login.body.patient.id).toBe(original.id);

    const resolved = await admin.patientClaimRequest.findUniqueOrThrow({ where: { id: claim.id } });
    expect(resolved.status).toBe('LINKED');
    expect(resolved.resolvedPatientId).toBe(original.id);

    const auditActions = await admin.auditLog.findMany({
      where: { organizationId: org.id, entityId: original.id, action: 'patient_account.linked' },
    });
    expect(auditActions.length).toBeGreaterThan(0);
  });

  it("resolving with 'create new' makes a second, distinct Patient row and leaves the original untouched", async () => {
    const { claim, original } = await createAmbiguousClaim('5559990003');
    const token = await staffLogin('reception@e2e-claims.example.com', receptionPassword);

    const res = await request(app.getHttpServer())
      .post(`/patient-claims/${claim.id}/create-new`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.id).not.toBe(original.id);

    const login = await request(app.getHttpServer())
      .post('/auth/patient/login')
      .send({ organizationId: org.id, email: claim.email, password: 'a-real-password-123' })
      .expect(201);
    expect(login.body.patient.id).toBe(res.body.id);

    const originalStillUnclaimed = await admin.patient.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(originalStillUnclaimed.passwordHash).toBeNull();
  });

  it('rejecting a claim leaves no working account for either candidate', async () => {
    const { claim } = await createAmbiguousClaim('5559990004');
    const token = await staffLogin('reception@e2e-claims.example.com', receptionPassword);

    await request(app.getHttpServer())
      .post(`/patient-claims/${claim.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Could not verify identity by phone.' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/patient/login')
      .send({ organizationId: org.id, email: claim.email, password: 'a-real-password-123' })
      .expect(401);

    const resolved = await admin.patientClaimRequest.findUniqueOrThrow({ where: { id: claim.id } });
    expect(resolved.status).toBe('REJECTED');
  });

  it('resolving an already-resolved claim again returns 400, not a second resolution', async () => {
    const { claim } = await createAmbiguousClaim('5559990005');
    const token = await staffLogin('reception@e2e-claims.example.com', receptionPassword);

    await request(app.getHttpServer())
      .post(`/patient-claims/${claim.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/patient-claims/${claim.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});
