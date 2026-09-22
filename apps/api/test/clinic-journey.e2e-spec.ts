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
  const labTechAPassword = 'lab-tech-a-password';
  const adminBPassword = 'admin-b-password';

  let patientAId: string;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    // Deleted in FK-dependency order — a previous run left
    // clinical_note_versions/audit_logs rows referencing this run's
    // organizations (and clinical_note_versions referencing its users
    // via authorId), so those have to go first or
    // user.deleteMany()/organization.deleteMany() hit a foreign key
    // violation.
    const orgFilter = { organizationId: { in: [orgA.id, orgB.id] } };
    await admin.auditLog.deleteMany({ where: orgFilter });
    await admin.clinicalNoteVersion.deleteMany({ where: orgFilter });
    await admin.clinicalNote.deleteMany({ where: orgFilter });
    await admin.diagnosisVersion.deleteMany({ where: orgFilter });
    await admin.diagnosis.deleteMany({ where: orgFilter });
    await admin.prescriptionItem.deleteMany({ where: orgFilter });
    await admin.prescription.deleteMany({ where: orgFilter });
    await admin.labResult.deleteMany({ where: orgFilter });
    await admin.labOrderItem.deleteMany({ where: orgFilter });
    await admin.labOrder.deleteMany({ where: orgFilter });
    await admin.patientConsent.deleteMany({ where: orgFilter });
    await admin.patientDocument.deleteMany({ where: orgFilter });
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
        organizationId: orgA.id,
        email: 'labtech@journey-a.example.com',
        passwordHash: await bcrypt.hash(labTechAPassword, 4),
        fullName: 'Lab Technician A',
        role: StaffRole.LAB_TECHNICIAN,
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

  describe('staff patient registration and listing', () => {
    it('registers a patient and it appears in the org-scoped list, patient-facing only, no password set', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      const registerRes = await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Registered',
          lastName: 'ByStaff',
          dateOfBirth: '1995-05-05',
          phone: '9888888888',
        })
        .expect(201);
      expect(registerRes.body.firstName).toBe('Registered');
      // No password field ever comes back — passwordHash isn't selected
      // by the create's default return shape, and no password was set
      // by this flow in the first place (see PatientsService.register).
      expect(registerRes.body.passwordHash).toBeUndefined();

      const listRes = await request(app.getHttpServer())
        .get('/patients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((listRes.body as { id: string }[]).some((p) => p.id === registerRes.body.id)).toBe(
        true,
      );
    });

    it('?q= searches by name/phone, case-insensitive, and excludes non-matches', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Searchable',
          lastName: 'Zephyrine',
          dateOfBirth: '1988-01-01',
          phone: '9777000111',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Unrelated',
          lastName: 'Nobody',
          dateOfBirth: '1988-01-01',
          phone: '9777000222',
        })
        .expect(201);

      const byName = await request(app.getHttpServer())
        .get('/patients')
        .query({ q: 'zephyrine' }) // lowercase — proves case-insensitivity
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const namesFound = (byName.body as { firstName: string }[]).map((p) => p.firstName);
      expect(namesFound).toContain('Searchable');
      expect(namesFound).not.toContain('Unrelated');

      const byPhone = await request(app.getHttpServer())
        .get('/patients')
        .query({ q: '9777000111' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((byPhone.body as { firstName: string }[]).map((p) => p.firstName)).toEqual([
        'Searchable',
      ]);

      // A typed "First Last" is the common case for a name search box —
      // neither field alone contains the two-word string, so this only
      // works because of the split-words fallback.
      const byFullName = await request(app.getHttpServer())
        .get('/patients')
        .query({ q: 'searchable zephyrine' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((byFullName.body as { firstName: string }[]).map((p) => p.firstName)).toEqual([
        'Searchable',
      ]);
    });
  });

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
      // Extended for the staff-web doctor workspace — the consultation
      // view needs diagnoses/prescriptions/labOrders alongside
      // vitals/clinicalNotes, not just the original two.
      expect(encounterRes.body.diagnoses).toEqual([]);
      expect(encounterRes.body.prescriptions).toEqual([]);
      expect(encounterRes.body.labOrders).toEqual([]);

      const listRes = await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const listed = (
        listRes.body as { id: string; patient: { firstName: string }; encounter: { id: string } }[]
      ).find((a) => a.id === createRes.body.id)!;
      expect(listed.patient.firstName).toBe('Journey');
      expect(listed.encounter.id).toBe(checkInRes.body.id);
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

  describe('diagnosis versioning (draft -> sign-off -> amend)', () => {
    it('every state transition inserts a new version row — none are ever updated in place', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const draftRes = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, icdCode: 'J06.9', description: 'Acute upper respiratory infection' })
        .expect(201);
      expect(draftRes.body.status).toBe('DRAFT');
      const diagnosisId = draftRes.body.id as string;

      const signOffRes = await request(app.getHttpServer())
        .post(`/diagnoses/${diagnosisId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(signOffRes.body.status).toBe('FINALIZED');
      expect(signOffRes.body.versionNumber).toBe(2);

      // Refuses to sign off twice — use amend for a correction instead.
      await request(app.getHttpServer())
        .post(`/diagnoses/${diagnosisId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      const amendRes = await request(app.getHttpServer())
        .post(`/diagnoses/${diagnosisId}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Acute bronchitis (corrected)' })
        .expect(201);
      expect(amendRes.body.status).toBe('AMENDED');
      expect(amendRes.body.versionNumber).toBe(3);

      const historyRes = await request(app.getHttpServer())
        .get(`/diagnoses/${diagnosisId}`)
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
      expect(historyRes.body.versions[0].description).toBe('Acute upper respiratory infection');
    });

    it('refuses to amend a diagnosis that has never been finalized', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const draftRes = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, description: 'Still a draft.' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/diagnoses/${draftRes.body.id}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Trying to amend an unfinalized diagnosis.' })
        .expect(409);
    });

    it('a JUNIOR_DOCTOR can write drafts but not sign off — SENIOR_DOCTOR/ADMINISTRATOR only', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const juniorToken = await login(orgA.id, 'junior@journey-a.example.com', juniorAPassword);
      const encounterId = await createCheckedInEncounter(adminToken);

      const draftRes = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({ encounterId, description: 'Junior doctor diagnosis.' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/diagnoses/${draftRes.body.id}/sign-off`)
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);
    });
  });

  describe('prescriptions (issue -> cancel, no draft/sign-off)', () => {
    it('issues a prescription with items in one step, then can cancel it — items are never editable', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const createRes = await request(app.getHttpServer())
        .post('/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          encounterId,
          items: [
            { medicationName: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily' },
            { medicationName: 'Paracetamol', dosage: '650mg', frequency: 'As needed' },
          ],
        })
        .expect(201);
      expect(createRes.body.status).toBe('ACTIVE');
      expect(createRes.body.items).toHaveLength(2);
      const prescriptionId = createRes.body.id as string;

      const getRes = await request(app.getHttpServer())
        .get(`/prescriptions/${prescriptionId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(getRes.body.items.map((i: { medicationName: string }) => i.medicationName)).toEqual([
        'Amoxicillin',
        'Paracetamol',
      ]);

      const cancelRes = await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(cancelRes.body.status).toBe('CANCELLED');
      // Cancelling is a status transition on the prescription only — the
      // items themselves are untouched, still the exact content issued.
      expect(cancelRes.body.items.map((i: { medicationName: string }) => i.medicationName)).toEqual(
        ['Amoxicillin', 'Paracetamol'],
      );

      // Refuses to cancel twice.
      await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });

    it('refuses to create a prescription with zero items', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      await request(app.getHttpServer())
        .post('/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, items: [] })
        .expect(400);
    });
  });

  describe('lab orders (order -> result, split lab-order:write / lab-result:write permissions)', () => {
    it('orders tests, records a result per item, and can cancel the order — nothing is ever editable', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      const orderRes = await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, items: [{ testName: 'CBC' }, { testName: 'Lipid Panel' }] })
        .expect(201);
      expect(orderRes.body.status).toBe('ORDERED');
      expect(orderRes.body.items).toHaveLength(2);
      const labOrderId = orderRes.body.id as string;
      const cbcItemId = orderRes.body.items.find((i: { testName: string }) => i.testName === 'CBC')
        .id as string;

      const resultRes = await request(app.getHttpServer())
        .post(`/lab-orders/items/${cbcItemId}/results`)
        .set('Authorization', `Bearer ${token}`)
        .send({ resultValue: '5.4', unit: 'x10^9/L', referenceRange: '4.0-11.0' })
        .expect(201);
      expect(resultRes.body.resultValue).toBe('5.4');

      const getRes = await request(app.getHttpServer())
        .get(`/lab-orders/${labOrderId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const cbcItem = getRes.body.items.find((i: { testName: string }) => i.testName === 'CBC');
      expect(cbcItem.results).toHaveLength(1);
      expect(cbcItem.results[0].resultValue).toBe('5.4');

      const cancelRes = await request(app.getHttpServer())
        .post(`/lab-orders/${labOrderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(cancelRes.body.status).toBe('CANCELLED');

      await request(app.getHttpServer())
        .post(`/lab-orders/${labOrderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });

    it('a JUNIOR_DOCTOR can order tests but not record results — lab-order:write and lab-result:write are separate permissions', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const juniorToken = await login(orgA.id, 'junior@journey-a.example.com', juniorAPassword);
      const encounterId = await createCheckedInEncounter(adminToken);

      const orderRes = await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({ encounterId, items: [{ testName: 'CBC' }] })
        .expect(201);
      const itemId = orderRes.body.items[0].id as string;

      await request(app.getHttpServer())
        .post(`/lab-orders/items/${itemId}/results`)
        .set('Authorization', `Bearer ${juniorToken}`)
        .send({ resultValue: '5.4' })
        .expect(403);
    });

    it('a LAB_TECHNICIAN can record results but not order tests — the reverse split, and the gap this role was added to close', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const labTechToken = await login(orgA.id, 'labtech@journey-a.example.com', labTechAPassword);
      const encounterId = await createCheckedInEncounter(adminToken);

      // Ordering stays a doctor's decision — LAB_TECHNICIAN doesn't get
      // lab-order:write.
      await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${labTechToken}`)
        .send({ encounterId, items: [{ testName: 'CBC' }] })
        .expect(403);

      const orderRes = await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ encounterId, items: [{ testName: 'CBC' }] })
        .expect(201);
      const itemId = orderRes.body.items[0].id as string;

      // Before this role existed, only ADMINISTRATOR could do this —
      // this is the concrete fix, not just a schema addition.
      const resultRes = await request(app.getHttpServer())
        .post(`/lab-orders/items/${itemId}/results`)
        .set('Authorization', `Bearer ${labTechToken}`)
        .send({ resultValue: '5.4' })
        .expect(201);
      expect(resultRes.body.resultValue).toBe('5.4');
    });

    it('refuses to create a lab order with zero items', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const encounterId = await createCheckedInEncounter(token);

      await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, items: [] })
        .expect(400);
    });
  });

  describe('patient documents (metadata only, ordinary soft-delete)', () => {
    it('registers a document, lists it, then removes it (soft-delete, not a real delete)', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      const registerRes = await request(app.getHttpServer())
        .post('/patient-documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patientAId,
          documentType: 'ID_PROOF',
          storageKey: 'orgs/e2e-journey-org-a/patients/x/id-proof.jpg',
          fileName: 'id-proof.jpg',
          mimeType: 'image/jpeg',
        })
        .expect(201);
      expect(registerRes.body.documentType).toBe('ID_PROOF');
      const documentId = registerRes.body.id as string;

      const listRes = await request(app.getHttpServer())
        .get(`/patient-documents/patient/${patientAId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listRes.body.some((d: { id: string }) => d.id === documentId)).toBe(true);

      await request(app.getHttpServer())
        .post(`/patient-documents/${documentId}/remove`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // Soft-deleted — excluded from the default list, same convention
      // as every other soft-deletable model in this schema.
      const listAfterRes = await request(app.getHttpServer())
        .get(`/patient-documents/patient/${patientAId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(listAfterRes.body.some((d: { id: string }) => d.id === documentId)).toBe(false);
    });
  });

  describe('patient consent (append-only, no update ever)', () => {
    it('records a grant then a revoke, and derives the current state from the latest row', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);

      await request(app.getHttpServer())
        .post('/patient-consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: patientAId, consentType: 'TREATMENT', action: 'GRANTED' })
        .expect(201);

      const afterGrant = await request(app.getHttpServer())
        .get(`/patient-consent/patient/${patientAId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterGrant.body.current.TREATMENT).toBe('GRANTED');
      expect(afterGrant.body.history).toHaveLength(1);

      await request(app.getHttpServer())
        .post('/patient-consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: patientAId, consentType: 'TREATMENT', action: 'REVOKED' })
        .expect(201);

      const afterRevoke = await request(app.getHttpServer())
        .get(`/patient-consent/patient/${patientAId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(afterRevoke.body.current.TREATMENT).toBe('REVOKED');
      // Both entries preserved — nothing was overwritten, the grant is
      // still readable in history even though it's no longer current.
      expect(afterRevoke.body.history).toHaveLength(2);
      expect(afterRevoke.body.history[0].action).toBe('GRANTED');
      expect(afterRevoke.body.history[1].action).toBe('REVOKED');
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
      const diagnosisRes = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ encounterId: checkIn.body.id, description: 'Org A only.' })
        .expect(201);
      const prescriptionRes = await request(app.getHttpServer())
        .post('/prescriptions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          encounterId: checkIn.body.id,
          items: [{ medicationName: 'Org A only.', dosage: '1', frequency: '1' }],
        })
        .expect(201);
      const labOrderRes = await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ encounterId: checkIn.body.id, items: [{ testName: 'Org A only.' }] })
        .expect(201);
      await request(app.getHttpServer())
        .post('/patient-documents')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          patientId: patientAId,
          documentType: 'OTHER',
          storageKey: 'x',
          fileName: 'x',
          mimeType: 'text/plain',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/patient-consent')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ patientId: patientAId, consentType: 'DATA_SHARING', action: 'GRANTED' })
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

      await request(app.getHttpServer())
        .get(`/diagnoses/${diagnosisRes.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/prescriptions/${prescriptionRes.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/lab-orders/${labOrderRes.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      // patientAId belongs to org A — RLS filters these lists down to
      // nothing for org B's tenant context, rather than a 404 (these are
      // list endpoints, not single-resource lookups by ID).
      const docsForB = await request(app.getHttpServer())
        .get(`/patient-documents/patient/${patientAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(docsForB.body).toEqual([]);

      const consentForB = await request(app.getHttpServer())
        .get(`/patient-consent/patient/${patientAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(consentForB.body.history).toEqual([]);
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

  describe('audit trail', () => {
    // AuditService.record() used to exist with nobody calling it — real
    // rows are what actually prove it's wired into the write paths that
    // matter, not just that the app boots. Each assertion below checks
    // both that the entry exists AND that its actorId is the real
    // authenticated caller, not a hardcoded/missing value.
    it('check-in, vitals, and every clinical note transition each write a real AuditLog entry', async () => {
      const token = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const meRes = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const adminAId = (meRes.body as { id: string; email: string }[]).find(
        (u) => u.email === 'admin@journey-a.example.com',
      )!.id;

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
      const encounterId = checkIn.body.id as string;

      await request(app.getHttpServer())
        .post('/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, pulseBpm: 72 })
        .expect(201);

      const draftRes = await request(app.getHttpServer())
        .post('/clinical-notes')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, subjective: 'Audit trail check.' })
        .expect(201);
      const noteId = draftRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/clinical-notes/${noteId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/clinical-notes/${noteId}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subjective: 'Audit trail check, corrected.' })
        .expect(201);

      const diagnosisDraftRes = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, description: 'Audit trail check.' })
        .expect(201);
      const diagnosisId = diagnosisDraftRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/diagnoses/${diagnosisId}/sign-off`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/diagnoses/${diagnosisId}/amend`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Audit trail check, corrected.' })
        .expect(201);

      const prescriptionRes = await request(app.getHttpServer())
        .post('/prescriptions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          encounterId,
          items: [{ medicationName: 'Audit trail check.', dosage: '1', frequency: '1' }],
        })
        .expect(201);
      const prescriptionId = prescriptionRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/prescriptions/${prescriptionId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const labOrderRes = await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ encounterId, items: [{ testName: 'Audit trail check.' }] })
        .expect(201);
      const labOrderId = labOrderRes.body.id as string;
      const labOrderItemId = labOrderRes.body.items[0].id as string;

      const labResultRes = await request(app.getHttpServer())
        .post(`/lab-orders/items/${labOrderItemId}/results`)
        .set('Authorization', `Bearer ${token}`)
        .send({ resultValue: 'Normal' })
        .expect(201);
      const labResultId = labResultRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/lab-orders/${labOrderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const documentRes = await request(app.getHttpServer())
        .post('/patient-documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId: patientAId,
          documentType: 'OTHER',
          storageKey: 'audit-trail-check',
          fileName: 'audit-trail-check.txt',
          mimeType: 'text/plain',
        })
        .expect(201);
      const documentId = documentRes.body.id as string;

      await request(app.getHttpServer())
        .post(`/patient-documents/${documentId}/remove`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const consentRes = await request(app.getHttpServer())
        .post('/patient-consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: patientAId, consentType: 'TREATMENT', action: 'GRANTED' })
        .expect(201);
      const consentId = consentRes.body.id as string;

      const auditRes = await request(app.getHttpServer())
        .get('/audit')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const entries = auditRes.body as {
        action: string;
        entityType: string;
        entityId: string;
        actorId: string;
      }[];

      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'appointment.check_in',
            entityType: 'Appointment',
            entityId: appt.body.id,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'vitals.record',
            entityType: 'Vital',
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'clinical_note.create_draft',
            entityType: 'ClinicalNote',
            entityId: noteId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'clinical_note.sign_off',
            entityType: 'ClinicalNote',
            entityId: noteId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'clinical_note.amend',
            entityType: 'ClinicalNote',
            entityId: noteId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'diagnosis.create_draft',
            entityType: 'Diagnosis',
            entityId: diagnosisId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'diagnosis.sign_off',
            entityType: 'Diagnosis',
            entityId: diagnosisId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'diagnosis.amend',
            entityType: 'Diagnosis',
            entityId: diagnosisId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'prescription.create',
            entityType: 'Prescription',
            entityId: prescriptionId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'prescription.cancel',
            entityType: 'Prescription',
            entityId: prescriptionId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'lab_order.create',
            entityType: 'LabOrder',
            entityId: labOrderId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'lab_result.record',
            entityType: 'LabResult',
            entityId: labResultId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'lab_order.cancel',
            entityType: 'LabOrder',
            entityId: labOrderId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'patient_document.register',
            entityType: 'PatientDocument',
            entityId: documentId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'patient_document.remove',
            entityType: 'PatientDocument',
            entityId: documentId,
            actorId: adminAId,
          }),
          expect.objectContaining({
            action: 'patient_consent.record',
            entityType: 'PatientConsent',
            entityId: consentId,
            actorId: adminAId,
          }),
        ]),
      );
    });

    it("org B's admin cannot see org A's audit entries", async () => {
      const tokenB = await login(orgB.id, 'admin@journey-b.example.com', adminBPassword);
      const auditRes = await request(app.getHttpServer())
        .get('/audit')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const entries = auditRes.body as { entityType: string }[];
      expect(entries.some((e) => e.entityType === 'ClinicalNote')).toBe(false);
      expect(entries.some((e) => e.entityType === 'Appointment')).toBe(false);
    });
  });

  describe('patient portal — GET /patients/me/*', () => {
    it('a patient can see their own appointments/diagnoses/prescriptions/lab orders — and a DRAFT diagnosis is excluded, only the signed-off one shows', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      const portalPassword = 'portal-patient-password';
      const portalPatient = await admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Portal',
          lastName: 'Patient',
          dateOfBirth: new Date('1990-01-01'),
          phone: '9000000000',
          email: 'portal-patient@journey-a.example.com',
          passwordHash: await bcrypt.hash(portalPassword, 4),
        },
      });

      const appt = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: portalPatient.id,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date().toISOString(),
        })
        .expect(201);
      const checkIn = await request(app.getHttpServer())
        .post(`/appointments/${appt.body.id}/check-in`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      const encounterId = checkIn.body.id as string;

      // A draft diagnosis — must NOT be visible to the patient.
      const draftDiagnosis = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ encounterId, description: 'Still being worked out.' })
        .expect(201);

      // A signed-off diagnosis — must be visible.
      const finalizedDiagnosis = await request(app.getHttpServer())
        .post('/diagnoses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ encounterId, description: 'Confirmed condition.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/diagnoses/${finalizedDiagnosis.body.id}/sign-off`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post('/prescriptions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          encounterId,
          items: [{ medicationName: 'Amoxicillin', dosage: '500mg', frequency: 'Twice daily' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/lab-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ encounterId, items: [{ testName: 'CBC' }] })
        .expect(201);

      const patientLoginRes = await request(app.getHttpServer())
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'portal-patient@journey-a.example.com',
          password: portalPassword,
        })
        .expect(201);
      const patientToken = patientLoginRes.body.accessToken as string;

      const myAppointments = await request(app.getHttpServer())
        .get('/patients/me/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      expect(myAppointments.body).toHaveLength(1);
      expect(myAppointments.body[0].id).toBe(appt.body.id);

      const myDiagnoses = await request(app.getHttpServer())
        .get('/patients/me/diagnoses')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      expect(myDiagnoses.body).toHaveLength(1);
      expect(myDiagnoses.body[0].id).toBe(finalizedDiagnosis.body.id);
      expect(myDiagnoses.body[0].versions[0].description).toBe('Confirmed condition.');
      expect(
        (myDiagnoses.body as { id: string }[]).some((d) => d.id === draftDiagnosis.body.id),
      ).toBe(false);

      const myPrescriptions = await request(app.getHttpServer())
        .get('/patients/me/prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      expect(myPrescriptions.body).toHaveLength(1);
      expect(myPrescriptions.body[0].items[0].medicationName).toBe('Amoxicillin');

      const myLabOrders = await request(app.getHttpServer())
        .get('/patients/me/lab-orders')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(200);
      expect(myLabOrders.body).toHaveLength(1);
      expect(myLabOrders.body[0].items[0].testName).toBe('CBC');
    });

    it('a staff token is rejected on all four /patients/me/* routes', async () => {
      const adminToken = await login(orgA.id, 'admin@journey-a.example.com', adminAPassword);
      for (const path of ['appointments', 'diagnoses', 'prescriptions', 'lab-orders']) {
        await request(app.getHttpServer())
          .get(`/patients/me/${path}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(403);
      }
    });
  });
});
