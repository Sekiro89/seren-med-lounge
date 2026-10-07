import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * OPD registration -> token queue -> vitals/intake (medical history,
 * metabolic workup), plus the doctor-assigned appointment calendar.
 * Same conventions as clinic-journey.e2e-spec.ts.
 */
describe('OPD registration, queue and intake (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const orgA = { id: 'e2e-opd-org-a', name: 'E2E OPD Org A' };
  const orgB = { id: 'e2e-opd-org-b', name: 'E2E OPD Org B' };
  const password = 'opd-e2e-password';
  const patientPassword = 'opd-patient-password';

  let patientAId: string;
  let otherPatientAId: string;
  let juniorId: string;
  let receptionId: string;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    const orgFilter = { organizationId: { in: [orgA.id, orgB.id] } };
    await admin.auditLog.deleteMany({ where: orgFilter });
    await admin.queueEntry.deleteMany({ where: orgFilter });
    await admin.registration.deleteMany({ where: orgFilter });
    await admin.metabolicWorkup.deleteMany({ where: orgFilter });
    await admin.medicalHistoryEntry.deleteMany({ where: orgFilter });
    await admin.vital.deleteMany({ where: orgFilter });
    await admin.patientDocument.deleteMany({ where: orgFilter });
    await admin.encounter.deleteMany({ where: orgFilter });
    await admin.appointment.deleteMany({ where: orgFilter });
    await admin.user.deleteMany({ where: orgFilter });
    await admin.patient.deleteMany({ where: orgFilter });
    await admin.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });

    await admin.organization.create({ data: orgA });
    await admin.organization.create({ data: orgB });

    const hash = await bcrypt.hash(password, 4);
    const staff: Array<[string, string, string, StaffRole]> = [
      ['reception', orgA.id, 'reception@opd-a.example.com', StaffRole.RECEPTION],
      ['nurse', orgA.id, 'nurse@opd-a.example.com', StaffRole.NURSE],
      ['junior', orgA.id, 'junior@opd-a.example.com', StaffRole.JUNIOR_DOCTOR],
      ['senior', orgA.id, 'senior@opd-a.example.com', StaffRole.SENIOR_DOCTOR],
      ['billing', orgA.id, 'billing@opd-a.example.com', StaffRole.BILLING],
      ['adminB', orgB.id, 'admin@opd-b.example.com', StaffRole.ADMINISTRATOR],
    ];
    const ids: Record<string, string> = {};
    for (const [key, organizationId, email, role] of staff) {
      const user = await admin.user.create({
        data: { organizationId, email, passwordHash: hash, fullName: key, role },
      });
      ids[key] = user.id;
    }
    juniorId = ids.junior!;
    receptionId = ids.reception!;

    patientAId = (
      await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Opd',
          lastName: 'Patient',
          dateOfBirth: new Date('1980-02-02'),
          phone: '9666000001',
          email: 'patient@opd-a.example.com',
          passwordHash: await bcrypt.hash(patientPassword, 4),
        },
      })
    ).id;
    otherPatientAId = (
      await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Other',
          lastName: 'Opd',
          dateOfBirth: new Date('1960-06-06'),
          phone: '9666000002',
        },
      })
    ).id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    for (const [key, organizationId, email] of staff) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ organizationId, email, password });
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
    await admin.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  async function checkedInEncounter(patientId = patientAId, doctorId?: string) {
    const appt = await http()
      .post('/appointments')
      .set(as('reception'))
      .send({
        patientId,
        doctorId,
        entrySource: 'RECEPTION_WALK_IN',
        scheduledAt: new Date().toISOString(),
      })
      .expect(201);
    const encounter = await http()
      .post(`/appointments/${appt.body.id}/check-in`)
      .set(as('reception'))
      .expect(201);
    return encounter.body.id as string;
  }

  function register(encounterId: string, body: object, who = 'reception') {
    return http().post(`/encounters/${encounterId}/registration`).set(as(who)).send(body);
  }

  const verified = {
    visitType: 'NEW_CONSULTATION',
    consultationRoute: 'JUNIOR_ASSESSMENT',
    idProofVerified: true,
  };

  describe('appointments with an assigned doctor', () => {
    it('accepts a doctor, rejects a non-doctor, and filters a daily calendar', async () => {
      const scheduledAt = '2030-01-15T05:00:00.000Z'; // 10:30 IST
      const ok = await http()
        .post('/appointments')
        .set(as('reception'))
        .send({
          patientId: patientAId,
          doctorId: juniorId,
          entrySource: 'ONLINE_BOOKING',
          scheduledAt,
        })
        .expect(201);
      expect(ok.body.doctorId).toBe(juniorId);

      await http()
        .post('/appointments')
        .set(as('reception'))
        .send({
          patientId: patientAId,
          doctorId: receptionId,
          entrySource: 'ONLINE_BOOKING',
          scheduledAt,
        })
        .expect(400);

      const day = await http()
        .get(`/appointments?doctorId=${juniorId}&date=2030-01-15`)
        .set(as('reception'))
        .expect(200);
      expect(day.body.map((a: { id: string }) => a.id)).toEqual([ok.body.id]);
      expect(day.body[0].doctor.fullName).toBe('junior');

      const otherDay = await http()
        .get(`/appointments?doctorId=${juniorId}&date=2030-01-16`)
        .set(as('reception'))
        .expect(200);
      expect(otherDay.body).toHaveLength(0);
    });
  });

  describe('registration and tokens', () => {
    it('requires ID proof, then registers and issues a VITALS token exactly once', async () => {
      const encounterId = await checkedInEncounter();

      await register(encounterId, {
        visitType: 'NEW_CONSULTATION',
        consultationRoute: 'DIRECT_SENIOR',
      }).expect(400);

      const res = await register(encounterId, {
        ...verified,
        cancerScreeningRequired: true,
      }).expect(201);
      expect(res.body.registration.cancerScreeningRequired).toBe(true);
      expect(res.body.queueEntry.station).toBe('VITALS');
      expect(res.body.queueEntry.status).toBe('WAITING');
      expect(res.body.queueEntry.tokenNumber).toBeGreaterThan(0);

      await register(encounterId, verified).expect(409);
    });

    it("accepts this patient's ID_PROOF document but not another patient's", async () => {
      const mine = await admin.patientDocument.create({
        data: {
          organizationId: orgA.id,
          patientId: patientAId,
          documentType: 'ID_PROOF',
          storageKey: 'k1',
          fileName: 'id.jpg',
          mimeType: 'image/jpeg',
          uploadedById: receptionId,
        },
      });
      const theirs = await admin.patientDocument.create({
        data: {
          organizationId: orgA.id,
          patientId: otherPatientAId,
          documentType: 'ID_PROOF',
          storageKey: 'k2',
          fileName: 'id.jpg',
          mimeType: 'image/jpeg',
          uploadedById: receptionId,
        },
      });

      const encounterId = await checkedInEncounter();
      await register(encounterId, {
        ...verified,
        idProofVerified: false,
        idProofDocumentId: theirs.id,
      }).expect(400);
      await register(encounterId, {
        ...verified,
        idProofVerified: false,
        idProofDocumentId: mine.id,
      }).expect(201);
    });

    it('never hands out the same token twice under concurrent registrations', async () => {
      const encounters = [];
      for (let i = 0; i < 4; i++) encounters.push(await checkedInEncounter());
      const results = await Promise.all(encounters.map((id) => register(id, verified)));
      results.forEach((r) => expect(r.status).toBe(201));
      const numbers = results.map((r) => r.body.queueEntry.tokenNumber);
      expect(new Set(numbers).size).toBe(4);
    });

    it('lets only patient:write roles register', async () => {
      const encounterId = await checkedInEncounter();
      await register(encounterId, verified, 'nurse').expect(403);
    });
  });

  describe('queue', () => {
    it('moves a token through the stations with valid transitions only', async () => {
      const encounterId = await checkedInEncounter();
      const { body } = await register(encounterId, verified).expect(201);
      const id = body.queueEntry.id;

      const vitalsQueue = await http()
        .get('/queue?station=VITALS&status=WAITING')
        .set(as('nurse'))
        .expect(200);
      expect(vitalsQueue.body.map((e: { id: string }) => e.id)).toContain(id);
      expect(vitalsQueue.body[0].patient.firstName).toBeDefined();

      await http().post(`/queue/${id}/complete`).set(as('nurse')).expect(409);
      const called = await http().post(`/queue/${id}/call`).set(as('nurse')).expect(201);
      expect(called.body.status).toBe('CALLED');
      expect(called.body.calledAt).toBeTruthy();

      const moved = await http()
        .post(`/queue/${id}/move`)
        .set(as('nurse'))
        .send({ station: 'JUNIOR_DOCTOR' })
        .expect(201);
      expect(moved.body).toMatchObject({
        station: 'JUNIOR_DOCTOR',
        status: 'WAITING',
        calledAt: null,
      });

      await http().post(`/queue/${id}/start`).set(as('junior')).expect(201);
      const done = await http().post(`/queue/${id}/complete`).set(as('junior')).expect(201);
      expect(done.body.status).toBe('COMPLETED');
      await http()
        .post(`/queue/${id}/move`)
        .set(as('junior'))
        .send({ station: 'BILLING' })
        .expect(409);

      await http().get('/queue').set(as('billing')).expect(403);
      await http().get('/queue?station=NOWHERE').set(as('nurse')).expect(400);
    });

    it('shows a patient their own token today', async () => {
      const login = await http()
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'patient@opd-a.example.com',
          password: patientPassword,
        })
        .expect(201);
      const mine = await http()
        .get('/patients/me/queue')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(mine.body.length).toBeGreaterThan(0);
      expect(Object.keys(mine.body[0]).sort()).toEqual([
        'id',
        'queueDate',
        'station',
        'status',
        'tokenNumber',
      ]);
    });
  });

  describe('vitals and metabolic workup', () => {
    it('records the new vitals fields, computing BMI from height and weight', async () => {
      const encounterId = await checkedInEncounter();
      const res = await http()
        .post('/vitals')
        .set(as('nurse'))
        .send({ encounterId, heightCm: 170, weightKg: 72, respiratoryRate: 16 })
        .expect(201);
      expect(res.body.bmi).toBe(24.9);
      expect(res.body.respiratoryRate).toBe(16);

      await http()
        .post('/vitals')
        .set(as('nurse'))
        .send({ encounterId, respiratoryRate: 500 })
        .expect(400);
    });

    it('records a metabolic workup and shows intake on the encounter', async () => {
      const encounterId = await checkedInEncounter();
      await register(encounterId, verified).expect(201);

      await http()
        .post('/metabolic-workups')
        .set(as('nurse'))
        .send({ encounterId, glucoseContext: 'FASTING' })
        .expect(400);
      const res = await http()
        .post('/metabolic-workups')
        .set(as('nurse'))
        .send({
          encounterId,
          glucoseMgDl: 98,
          glucoseContext: 'FASTING',
          hba1cPercent: 5.6,
          otherTests: { 'Vitamin D': 28 },
        })
        .expect(201);
      expect(res.body.hba1cPercent).toBe(5.6);

      await http()
        .post('/metabolic-workups')
        .set(as('reception'))
        .send({ encounterId, glucoseMgDl: 1 })
        .expect(403);

      const detail = await http().get(`/encounters/${encounterId}`).set(as('senior')).expect(200);
      expect(detail.body.metabolicWorkups).toHaveLength(1);
      expect(detail.body.registration.visitType).toBe('NEW_CONSULTATION');
      expect(detail.body.queueEntry.station).toBe('VITALS');
    });
  });

  describe('medical history', () => {
    it('records history, hides errors by default, and freezes an error entry', async () => {
      const allergy = await http()
        .post('/medical-history')
        .set(as('nurse'))
        .send({
          patientId: patientAId,
          category: 'ALLERGY',
          description: 'Penicillin',
          severity: 'SEVERE',
        })
        .expect(201);
      await http()
        .post('/medical-history')
        .set(as('nurse'))
        .send({
          patientId: patientAId,
          category: 'CONDITION',
          description: 'Asthma',
          severity: 'MILD',
        })
        .expect(400);
      const wrong = await http()
        .post('/medical-history')
        .set(as('junior'))
        .send({ patientId: patientAId, category: 'CONDITION', description: 'Wrong patient entry' })
        .expect(201);
      await http()
        .post('/medical-history')
        .set(as('reception'))
        .send({ patientId: patientAId, category: 'CONDITION', description: 'x' })
        .expect(403);

      await http()
        .post(`/medical-history/${wrong.body.id}/status`)
        .set(as('junior'))
        .send({ status: 'ENTERED_IN_ERROR' })
        .expect(201);
      await http()
        .post(`/medical-history/${wrong.body.id}/status`)
        .set(as('junior'))
        .send({ status: 'ACTIVE' })
        .expect(400);

      const list = await http()
        .get(`/medical-history?patientId=${patientAId}`)
        .set(as('senior'))
        .expect(200);
      const ids = list.body.map((e: { id: string }) => e.id);
      expect(ids).toContain(allergy.body.id);
      expect(ids).not.toContain(wrong.body.id);

      const all = await http()
        .get(`/medical-history?patientId=${patientAId}&includeErrors=true`)
        .set(as('senior'))
        .expect(200);
      expect(all.body.map((e: { id: string }) => e.id)).toContain(wrong.body.id);

      const login = await http()
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'patient@opd-a.example.com',
          password: patientPassword,
        })
        .expect(201);
      const mine = await http()
        .get('/patients/me/medical-history')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(mine.body.map((e: { id: string }) => e.id)).toEqual(
        expect.arrayContaining([allergy.body.id]),
      );
    });
  });

  describe('single patient for staff', () => {
    it('returns the profile with hasAccount, never the password hash, and 404s across tenants', async () => {
      const res = await http().get(`/patients/${patientAId}`).set(as('nurse')).expect(200);
      expect(res.body).toMatchObject({ id: patientAId, firstName: 'Opd', hasAccount: true });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(res.body).not.toHaveProperty('passwordHash');

      const noAccount = await http()
        .get(`/patients/${otherPatientAId}`)
        .set(as('nurse'))
        .expect(200);
      expect(noAccount.body.hasAccount).toBe(false);

      await http().get(`/patients/${patientAId}`).set(as('adminB')).expect(404);
      await http().get(`/patients/${patientAId}`).set(as('billing')).expect(200);
    });
  });

  describe('staff directory', () => {
    it('lists active staff (name and role only) for any staff member, filtered by role, and refuses patients', async () => {
      const all = await http().get('/users/directory').set(as('nurse')).expect(200);
      expect(all.body.map((u: { fullName: string }) => u.fullName)).toEqual(
        expect.arrayContaining(['nurse', 'junior', 'senior']),
      );
      expect(Object.keys(all.body[0]).sort()).toEqual(['fullName', 'id', 'role']);

      const doctors = await http()
        .get('/users/directory?role=SENIOR_DOCTOR')
        .set(as('billing'))
        .expect(200);
      expect(doctors.body.map((u: { role: string }) => u.role)).toEqual(['SENIOR_DOCTOR']);
      await http().get('/users/directory?role=NOPE').set(as('nurse')).expect(400);

      // Another organization's staff never appear.
      const other = await http().get('/users/directory').set(as('adminB')).expect(200);
      expect(other.body).toHaveLength(1);

      const login = await http()
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'patient@opd-a.example.com',
          password: patientPassword,
        })
        .expect(201);
      await http()
        .get('/users/directory')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403);
    });
  });

  describe('tenant isolation and audit', () => {
    it("never lets org B register, see, or move org A's visits", async () => {
      const encounterId = await checkedInEncounter();
      const { body } = await register(encounterId, verified).expect(201);

      await register(encounterId, verified, 'adminB').expect(404);
      await http().post(`/queue/${body.queueEntry.id}/call`).set(as('adminB')).expect(404);
      const queue = await http().get('/queue').set(as('adminB')).expect(200);
      expect(queue.body).toHaveLength(0);
      const history = await http()
        .get(`/medical-history?patientId=${patientAId}`)
        .set(as('adminB'))
        .expect(200);
      expect(history.body).toHaveLength(0);
    });

    it('audits registration, queue moves and history without free text', async () => {
      const logs = await admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const actions = new Set(logs.map((l) => l.action));
      [
        'registration.create',
        'queue.update',
        'medical_history.create',
        'medical_history.status_change',
        'metabolic_workup.record',
      ].forEach((a) => expect(actions.has(a)).toBe(true));
      expect(JSON.stringify(logs)).not.toContain('Penicillin');
    });
  });
});
