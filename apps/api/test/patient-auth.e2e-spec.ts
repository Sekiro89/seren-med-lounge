import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Patient authentication — a genuinely separate credential store and
 * token shape from staff auth (see
 * docs/architecture/security.md#authentication), so it gets its own
 * suite rather than being folded into auth-tenant.e2e-spec.ts. Covers:
 * patient login, GET /patients/me (own-record access, no StaffRole
 * permission involved), the actor-type boundary in both directions
 * (patient token rejected on a staff route and vice versa), and logout.
 */
describe('Patient auth (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const org = { id: 'e2e-patient-org', name: 'E2E Patient Org' };
  const patientPassword = 'patient-e2e-password';
  const staffPassword = 'staff-e2e-password';

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    await admin.patient.deleteMany({ where: { organizationId: org.id } });
    await admin.user.deleteMany({ where: { organizationId: org.id } });

    await admin.organization.upsert({ where: { id: org.id }, create: org, update: {} });

    await admin.patient.create({
      data: {
        organizationId: org.id,
        email: 'patient@e2e.example.com',
        passwordHash: await bcrypt.hash(patientPassword, 4), // low cost: test speed
        firstName: 'E2E',
        lastName: 'Patient',
        dateOfBirth: new Date('1985-06-15'),
        phone: '5550001111',
      },
    });

    await admin.user.create({
      data: {
        organizationId: org.id,
        email: 'staff@e2e.example.com',
        passwordHash: await bcrypt.hash(staffPassword, 4),
        fullName: 'E2E Staff',
        role: StaffRole.ADMINISTRATOR,
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

  async function patientLogin(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/patient/login')
      .send({ organizationId: org.id, email, password });
  }

  async function staffLogin(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId: org.id, email, password });
  }

  it('rejects a patient login under the wrong organizationId with 401', async () => {
    const res = await request(app.getHttpServer()).post('/auth/patient/login').send({
      organizationId: 'not-this-org',
      email: 'patient@e2e.example.com',
      password: patientPassword,
    });
    expect(res.status).toBe(401);
  });

  it('issues a token for correct patient credentials, distinct shape from staff', async () => {
    const res = await patientLogin('patient@e2e.example.com', patientPassword);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.patient).toMatchObject({
      email: 'patient@e2e.example.com',
      organizationId: org.id,
    });
    // No StaffRole leaks onto a patient token's response shape.
    expect(res.body.user).toBeUndefined();
  });

  it("GET /patients/me returns the patient's own profile", async () => {
    const { body } = await patientLogin('patient@e2e.example.com', patientPassword);
    const res = await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ email: 'patient@e2e.example.com', firstName: 'E2E' });
  });

  it('a patient token is rejected on a staff-only route (GET /users)', async () => {
    const { body } = await patientLogin('patient@e2e.example.com', patientPassword);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
  });

  it('a staff token is rejected on the patient-only route (GET /patients/me)', async () => {
    const { body } = await staffLogin('staff@e2e.example.com', staffPassword);
    const res = await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
    expect(res.body.message).toMatch(/only a patient/i);
  });

  it('POST /auth/patient/logout revokes the token', async () => {
    const { body } = await patientLogin('patient@e2e.example.com', patientPassword);

    await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/patient/logout')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(401);
  });
});
