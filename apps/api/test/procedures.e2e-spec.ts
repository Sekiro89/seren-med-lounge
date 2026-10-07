import { StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Referrals, procedures and surgery: estimate -> schedule -> consent +
 * pre-op checklist gate -> start -> complete, plus OT notes as versioned
 * clinical notes.
 */
describe('Referrals, procedures and surgery (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-proc-org-a', name: 'E2E Procedures Org A' };
  const orgB = { id: 'e2e-proc-org-b', name: 'E2E Procedures Org B' };
  let patient: { id: string; auth: { Authorization: string } };
  let encounterId: string;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'coordinator', organizationId: orgA.id, role: StaffRole.SURGERY_COORDINATOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@proc-a.example.com',
      phone: '9444000001',
    });
    encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
  });

  afterAll(() => ctx.close());

  async function consentDocument(patientId = patient.id, documentType = 'CONSENT_FORM') {
    const doc = await ctx.admin.patientDocument.create({
      data: {
        organizationId: orgA.id,
        patientId,
        documentType: documentType as 'CONSENT_FORM',
        storageKey: `consent-${Date.now()}`,
        fileName: 'consent.pdf',
        mimeType: 'application/pdf',
        uploadedById: ctx.ids.reception!,
      },
    });
    return doc.id;
  }

  describe('referrals', () => {
    it('sends an internal referral to a doctor’s inbox and closes it once', async () => {
      const res = await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('junior'))
        .send({
          encounterId,
          type: 'INTERNAL',
          toUserId: ctx.ids.senior,
          reason: 'Needs senior review',
          urgency: 'URGENT',
        })
        .expect(201);

      const inbox = await ctx
        .http()
        .get('/referrals?mine=true&status=OPEN')
        .set(ctx.as('senior'))
        .expect(200);
      expect(inbox.body.map((r: { id: string }) => r.id)).toContain(res.body.id);

      await ctx
        .http()
        .post(`/referrals/${res.body.id}/complete`)
        .set(ctx.as('senior'))
        .send({ outcomeNote: 'Seen' })
        .expect(201);
      await ctx
        .http()
        .post(`/referrals/${res.body.id}/cancel`)
        .set(ctx.as('senior'))
        .send({})
        .expect(409);
    });

    it('validates targets and permissions', async () => {
      await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('junior'))
        .send({ encounterId, type: 'INTERNAL', toUserId: ctx.ids.reception, reason: 'x' })
        .expect(400);
      await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('junior'))
        .send({ encounterId, type: 'EXTERNAL', reason: 'x' })
        .expect(400);
      await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('junior'))
        .send({
          encounterId,
          type: 'EXTERNAL',
          toFacility: 'City Cardiac Centre',
          toSpecialty: 'Cardiology',
          reason: 'Echo',
        })
        .expect(201);
      await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('reception'))
        .send({ encounterId, type: 'EXTERNAL', toFacility: 'X', reason: 'x' })
        .expect(403);
    });
  });

  describe('procedures and surgery', () => {
    it('lets a junior doctor plan a procedure but not a surgery', async () => {
      await ctx
        .http()
        .post('/procedures')
        .set(ctx.as('junior'))
        .send({ encounterId, kind: 'PROCEDURE', name: 'Wound dressing' })
        .expect(201);
      await ctx
        .http()
        .post('/procedures')
        .set(ctx.as('junior'))
        .send({ encounterId, kind: 'SURGERY', name: 'Appendectomy' })
        .expect(403);
    });

    it('gates the start on signed consent and a completed pre-op checklist', async () => {
      const created = await ctx
        .http()
        .post('/procedures')
        .set(ctx.as('senior'))
        .send({
          encounterId,
          kind: 'SURGERY',
          name: 'Laparoscopic cholecystectomy',
          estimateMinor: 8500000,
          checklist: ['NPO since midnight', 'Blood arranged'],
        })
        .expect(201);
      const id = created.body.id;
      expect(created.body.status).toBe('PLANNED');
      expect(created.body.checklist).toHaveLength(2);

      // A junior doctor can't touch a surgery even with procedure:manage.
      await ctx
        .http()
        .post(`/procedures/${id}/estimate`)
        .set(ctx.as('junior'))
        .send({ estimateMinor: 1 })
        .expect(403);
      await ctx
        .http()
        .post(`/procedures/${id}/estimate`)
        .set(ctx.as('coordinator'))
        .send({ estimateMinor: 9000000 })
        .expect(201);

      await ctx.http().post(`/procedures/${id}/start`).set(ctx.as('senior')).expect(409); // not scheduled

      await ctx
        .http()
        .post(`/procedures/${id}/schedule`)
        .set(ctx.as('coordinator'))
        .send({ scheduledAt: '2030-03-01T04:30:00.000Z', performedById: ctx.ids.reception })
        .expect(400);
      const scheduled = await ctx
        .http()
        .post(`/procedures/${id}/schedule`)
        .set(ctx.as('coordinator'))
        .send({
          scheduledAt: '2030-03-01T04:30:00.000Z',
          performedById: ctx.ids.senior,
          location: 'OT 1',
        })
        .expect(201);
      expect(scheduled.body.status).toBe('SCHEDULED');

      const otDay = await ctx
        .http()
        .get('/procedures?date=2030-03-01')
        .set(ctx.as('coordinator'))
        .expect(200);
      expect(otDay.body.map((p: { id: string }) => p.id)).toEqual([id]);

      await ctx.http().post(`/procedures/${id}/start`).set(ctx.as('senior')).expect(409); // no consent

      const wrongDoc = await consentDocument(patient.id, 'ID_PROOF');
      await ctx
        .http()
        .post(`/procedures/${id}/consent`)
        .set(ctx.as('coordinator'))
        .send({ documentId: wrongDoc })
        .expect(400);
      await ctx
        .http()
        .post(`/procedures/${id}/consent`)
        .set(ctx.as('coordinator'))
        .send({ documentId: await consentDocument() })
        .expect(201);

      await ctx.http().post(`/procedures/${id}/start`).set(ctx.as('senior')).expect(409); // checklist open

      for (const item of created.body.checklist) {
        await ctx
          .http()
          .post(`/procedures/${id}/checklist/${item.id}`)
          .set(ctx.as('coordinator'))
          .send({ done: true })
          .expect(201);
      }
      const extra = await ctx
        .http()
        .post(`/procedures/${id}/checklist`)
        .set(ctx.as('coordinator'))
        .send({ label: 'Site marked' })
        .expect(201);
      await ctx.http().post(`/procedures/${id}/start`).set(ctx.as('senior')).expect(409);
      await ctx
        .http()
        .post(`/procedures/${id}/checklist/${extra.body.id}`)
        .set(ctx.as('coordinator'))
        .send({ done: true })
        .expect(201);

      const started = await ctx
        .http()
        .post(`/procedures/${id}/start`)
        .set(ctx.as('senior'))
        .expect(201);
      expect(started.body.status).toBe('IN_PROGRESS');
      await ctx
        .http()
        .post(`/procedures/${id}/cancel`)
        .set(ctx.as('senior'))
        .send({ reason: 'x' })
        .expect(409);
      await ctx
        .http()
        .post(`/procedures/${id}/checklist`)
        .set(ctx.as('coordinator'))
        .send({ label: 'late' })
        .expect(409);

      const otNote = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('senior'))
        .send({
          encounterId,
          noteType: 'OPERATIVE',
          procedureId: id,
          objective: 'Uneventful laparoscopic procedure.',
        })
        .expect(201);
      expect(otNote.body.noteType).toBe('OPERATIVE');

      const completed = await ctx
        .http()
        .post(`/procedures/${id}/complete`)
        .set(ctx.as('senior'))
        .expect(201);
      expect(completed.body.status).toBe('COMPLETED');

      const detail = await ctx.http().get(`/procedures/${id}`).set(ctx.as('senior')).expect(200);
      expect(detail.body.clinicalNotes.map((n: { id: string }) => n.id)).toEqual([otNote.body.id]);
      expect(detail.body.estimateMinor).toBe(9000000);

      const mine = await ctx.http().get('/patients/me/procedures').set(patient.auth).expect(200);
      const seen = mine.body.find((p: { id: string }) => p.id === id);
      expect(seen).toMatchObject({ status: 'COMPLETED', estimateMinor: 9000000, location: 'OT 1' });
      expect(seen).not.toHaveProperty('notes');
    });

    it('cancels with a reason before it starts', async () => {
      const created = await ctx
        .http()
        .post('/procedures')
        .set(ctx.as('junior'))
        .send({ encounterId, kind: 'PROCEDURE', name: 'Mole excision' })
        .expect(201);
      const cancelled = await ctx
        .http()
        .post(`/procedures/${created.body.id}/cancel`)
        .set(ctx.as('junior'))
        .send({ reason: 'Patient declined' })
        .expect(201);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Patient declined',
      });
    });

    it('rejects an OT note pointing at another patient’s procedure', async () => {
      const other = await ctx.admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'O',
          lastName: 'P',
          dateOfBirth: new Date('1990-01-01'),
          phone: '9444000002',
        },
      });
      const otherEncounter = await checkedInEncounter(ctx, 'reception', other.id);
      const proc = await ctx
        .http()
        .post('/procedures')
        .set(ctx.as('junior'))
        .send({ encounterId: otherEncounter, kind: 'PROCEDURE', name: 'Suturing' })
        .expect(201);
      await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('senior'))
        .send({ encounterId, noteType: 'OPERATIVE', procedureId: proc.body.id, objective: 'x' })
        .expect(400);
    });
  });

  describe('isolation and audit', () => {
    it("keeps org B out of org A's procedures and referrals", async () => {
      const proc = await ctx.admin.procedure.findFirstOrThrow({
        where: { organizationId: orgA.id },
      });
      await ctx.http().get(`/procedures/${proc.id}`).set(ctx.as('adminB')).expect(404);
      await ctx
        .http()
        .post(`/procedures/${proc.id}/cancel`)
        .set(ctx.as('adminB'))
        .send({ reason: 'x' })
        .expect(404);
      const referrals = await ctx.http().get('/referrals').set(ctx.as('adminB')).expect(200);
      expect(referrals.body).toHaveLength(0);
    });

    it('audits without clinical free text', async () => {
      const logs = await ctx.admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const actions = new Set(logs.map((l) => l.action));
      [
        'referral.create',
        'procedure.create',
        'procedure.schedule',
        'procedure.consent_attached',
        'procedure.checklist_set',
        'procedure.status',
      ].forEach((a) => expect(actions.has(a)).toBe(true));
      const text = JSON.stringify(logs);
      expect(text).not.toContain('Needs senior review');
      expect(text).not.toContain('Patient declined');
    });
  });
});
