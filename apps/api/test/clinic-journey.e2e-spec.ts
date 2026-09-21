import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Automates the manual curl session used to live-verify the clinic
 * journey spine (Appointment -> Encounter -> Vital -> ClinicalNote) — the
 * vertical slice built to de-risk the two patterns the users/patients
 * slice never exercised: a multi-table transaction (check-in) and the
 * append-only clinical-record-versioning pattern. See the "CLINICAL
 * RECORD VERSIONING" note at the top of schema.prisma and
 * ClinicalNotesService's doc comment.
 *
 * Follows auth-tenant.e2e-spec.ts's conventions: scoped deleteMany in
 * beforeAll (not truncate), bcrypt cost 4 for speed, ThrottlerModule
 * disabled under NODE_ENV=test.
 *
 * What this suite does NOT re-prove (already covered by
 * auth-tenant.e2e-spec.ts and not worth duplicating): default-deny on an
 * unauthenticated request, JWT revocation, the org-scoped-creation
 * pattern for a simple single-table resource. This suite's job is the
 * two NEW patterns plus tenant isolation on the 5 new tables specifically.
 */
describe('Clinic journey spine (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const orgA = { id: 'e2e-journey-org-a', name: 'E2E Journey Org A' };
  const orgB = { id: 'e2e-journey-org-b', name: 'E2E Journey Org B' };
  const adminAPassword = 'admin-a-password';
  const juniorAPassword = 'junior-a-password';
  const adminBPassword = 'admin-b-password';

  let patientAId: string;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    // Deleted in FK-dependency order — a previous run left
    // clinical_note_versions rows referencing this run's users
    // (authorId) and patients, so those have to go first or
    // user.deleteMany()/patient.deleteMany() hit a foreign key violation.
    const orgFilter = { organizationId: { in: [orgA.id, orgB.id] } };
    await admin.clinicalNoteVersion.deleteMany({ where: orgFilter });
    await admin.clinicalNote.deleteMany({ where: orgFilter });
    await admin.vital.deleteMany({ where: orgFilter });
    await admin.encounter.deleteMany({ where: orgFilter });
    await admin.appointment.deleteMany({ where: orgFilter });
    await admin.user.deleteMany({ where: orgFilter });
    await admin.patient.deleteMany({ where: orgFilter });
    await admin.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });

    await admin.organization.create({ data: orgA });
    await admin.organization.create({ data: orgB });

    await admin.user.create({
      data: {
        organizationId: orgA.id,
        email: 'admin@journey-a.example.com',
        passwordHash: await bcrypt.hash(adminAPassword, 4),
        fullName: 'Admin A',
        role: StaffRole.ADMINISTRATOR,
      },
    });
    await admin.user.create({
      data: {
        organizationId: orgA.id,
        email: 'junior@journey-a.example.com',
        passwordHash: await bcrypt.hash(juniorAPassword, 4),
        fullName: 'Junior Doctor A',
        role: StaffRole.JUNIOR_DOCTOR,
      },
    });
    await admin.user.create({
      data: {
        organizationId: orgB.id,
        email: 'admin@journey-b.example.com',
        passwordHash: await bcrypt.hash(adminBPassword, 4),
        fullName: 'Admin B',
        role: StaffRole.ADMINISTRATOR,
      },
    });

    const patientA = await admin.patient.create({
      data: {
        organizationId: orgA.id,
        firstName: 'Journey',
        lastName: 'Patient A',
        dateOfBirth: new Date('1990-01-01'),
        phone: '9999999999',
      },
    });
    patientAId = patientA.id;

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

  async function login(organizationId: string, email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId, email, password });
    return res.body.accessToken as string;
  }

  async function createCheckedInEncounter(token: string) {
    const appt = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId: patientAId,
        entrySource: 'RECEPTION_WALK_IN',
        scheduledAt: new Date().toISOString(),
      })
      .expect(201);
    const checkIn = await request(app.getHttpServer())
      .post(`/appointments/${appt.body.id}/check-in`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return checkIn.body.id as string;
  }

  describe('appointment -> check-in multi-table transaction', () => {
    it('check-in atomically transitions the appointment and creates an Encounter', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      const createRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patientAId,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date().toISOString(),
        })
        .expect(201);
      expect(createRes.body.status).toBe('REQUESTED');

      const checkInRes = await request(app.getHttpServer())
        .post(`/appointments/${createRes.body.id}/check-in`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(checkInRes.body.status).toBe('OPEN');
      expect(checkInRes.body.appointmentId).toBe(createRes.body.id);

      const encounterRes = await request(app.getHttpServer())
        .get(`/encounters/${checkInRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(encounterRes.body.id).toBe(checkInRes.body.id);
    });

    it('refuses to check in an already-checked-in appointment with 409', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      const createRes = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patientAId,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date().toISOString(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/appointments/${createRes.body.id}/check-in`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/appointments/${createRes.body.id}/check-in`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });

  describe('clinical note versioning (draft -> sign-off -> amend)', () => {
    it('every state transition inserts a new version row — none are ever updated in place', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const draftRes = await request(app.getHttpServer())
        .post('/clinical-notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, subjective: 'Initial complaint.' })
        .expect(201);
      expect(draftRes.body.status).toBe('DRAFT');
      const noteId = draftRes.body.id as string;

      const signOffRes = await request(app.getHttpServer())
        .post(`/clinical-notes/${noteId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(signOffRes.body.status).toBe('FINALIZED');
      expect(signOffRes.body.versionNumber).toBe(2);

      // Refuses to sign off twice — use amend for a correction instead.
      await request(app.getHttpServer())
        .post(`/clinical-notes/${noteId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      const amendRes = await request(app.getHttpServer())
        .post(`/clinical-notes/${noteId}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subjective: 'Corrected complaint.' })
        .expect(201);
      expect(amendRes.body.status).toBe('AMENDED');
      expect(amendRes.body.versionNumber).toBe(3);

      const historyRes = await request(app.getHttpServer())
        .get(`/clinical-notes/${noteId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(historyRes.body.versions).toHaveLength(3);
      expect(historyRes.body.versions.map((v: { status: string }) => v.status)).toEqual([
        'DRAFT',
        'FINALIZED',
        'AMENDED',
      ]);
      // The original draft content must still be readable, untouched, in
      // version 1 — proving amend() never rewrote history.
      expect(historyRes.body.versions[0].subjective).toBe('Initial complaint.');
    });

    it('refuses to amend a note that has never been finalized', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const draftRes = await request(app.getHttpServer())
        .post('/clinical-notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, subjective: 'Still a draft.' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/clinical-notes/${draftRes.body.id}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subjective: 'Trying to amend an unfinalized note.' })
        .expect(409);
    });

    it('a JUNIOR_DOCTOR can write drafts but not sign off — SENIOR_DOCTOR/ADMINISTRATOR only', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const juniorToken = await login(orgA.id, 'junior@journey-a.example.com', juniorAPassword);
      const encounterId = await createCheckedInEncounter(adminToken);

      const draftRes = await request(app.getHttpServer())
        .post('/clinical-notes')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({ encounterId, subjective: 'Junior doctor draft.' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/clinical-notes/${draftRes.body.id}/sign-off`)
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);
    });
  });

  describe('tenant isolation on the 5 new tables', () => {
    it("org B cannot read org A's appointments, encounters, or clinical notes", async () => {
      const tokenA = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const tokenB = await login(orgB.id, 'admin@journey-b.example.com', adminBPassword);

      const appt = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          patientId: patientAId,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date().toISOString(),
        })
        .expect(201);
      const checkIn = await request(app.getHttpServer())
        .post(`/appointments/${appt.body.id}/check-in`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(201);
      const noteRes = await request(app.getHttpServer())
        .post('/clinical-notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ encounterId: checkIn.body.id, subjective: 'Org A only.' })
        .expect(201);

      const listRes = await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(listRes.body).toEqual([]);

      await request(app.getHttpServer())
        .get(`/encounters/${checkIn.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/clinical-notes/${noteRes.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('vitals', () => {
    it('records vitals against an encounter and they appear in the encounter detail view', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      await request(app.getHttpServer())
        .post('/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, pulseBpm: 80, spo2Percent: 98 })
        .expect(201);

      const encounterRes = await request(app.getHttpServer())
        .get(`/encounters/${encounterId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(encounterRes.body.vitals).toHaveLength(1);
      expect(encounterRes.body.vitals[0]).toMatchObject({ pulseBpm: 80, spo2Percent: 98 });
    });
  });
});
