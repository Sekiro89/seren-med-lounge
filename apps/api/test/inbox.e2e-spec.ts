import { StaffRole } from '@prisma/client';
import { createPatientWithLogin, setupContext, type TestContext } from './helpers';

/**
 * GET /inbox: unsigned drafts, out-of-range lab results and open internal
 * referrals, narrowed by who is asking.
 */
describe('Staff inbox (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-inbox-org-a', name: 'E2E Inbox Org A' };
  const orgB = { id: 'e2e-inbox-org-b', name: 'E2E Inbox Org B' };
  let patient: { id: string; auth: { Authorization: string } };
  let encounterId: string;
  let noteId: string;
  let diagnosisId: string;
  let referralId: string;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'junior2', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'lab', organizationId: orgA.id, role: StaffRole.LAB_TECHNICIAN },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'billing', organizationId: orgA.id, role: StaffRole.BILLING },
        { key: 'seniorB', organizationId: orgB.id, role: StaffRole.SENIOR_DOCTOR },
      ],
    );
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@inbox-a.example.com',
      phone: '9444000001',
      firstName: 'Inbox',
    });

    // A visit with the junior doctor, checked in (encounter stays OPEN).
    const appt = await ctx
      .http()
      .post('/appointments')
      .set(ctx.as('reception'))
      .send({
        patientId: patient.id,
        doctorId: ctx.ids.junior,
        entrySource: 'RECEPTION_WALK_IN',
        scheduledAt: new Date().toISOString(),
      })
      .expect(201);
    const encounter = await ctx
      .http()
      .post(`/appointments/${appt.body.id}/check-in`)
      .set(ctx.as('reception'))
      .expect(201);
    encounterId = encounter.body.id;

    const note = await ctx
      .http()
      .post('/clinical-notes')
      .set(ctx.as('junior'))
      .send({ encounterId, assessment: 'Fatigue, query anaemia' })
      .expect(201);
    noteId = note.body.id;
    const diagnosis = await ctx
      .http()
      .post('/diagnoses')
      .set(ctx.as('junior2'))
      .send({ encounterId, description: 'Iron deficiency anaemia' })
      .expect(201);
    diagnosisId = diagnosis.body.id;

    const order = await ctx
      .http()
      .post('/lab-orders')
      .set(ctx.as('junior'))
      .send({
        encounterId,
        items: [
          { testName: 'Glucose' },
          { testName: 'Haemoglobin' },
          { testName: 'HbA1c' },
          { testName: 'LDL' },
          { testName: 'HDL' },
          { testName: 'HIV' },
          { testName: 'TSH' },
        ],
      })
      .expect(201);
    const results: Record<string, { resultValue: string; referenceRange: string; unit?: string }> =
      {
        Glucose: { resultValue: '126', referenceRange: '70 to 100', unit: 'mg/dL' },
        Haemoglobin: { resultValue: '10.2', referenceRange: '12.0-15.5', unit: 'g/dL' },
        HbA1c: { resultValue: '5.0', referenceRange: '4.0-5.6', unit: '%' },
        LDL: { resultValue: '160', referenceRange: '<100' },
        HDL: { resultValue: '35', referenceRange: '>40' },
        HIV: { resultValue: 'Non-reactive', referenceRange: 'Non-reactive' },
        TSH: { resultValue: 'haemolysed', referenceRange: '0.4 to 4.0' },
      };
    for (const item of order.body.items as Array<{ id: string; testName: string }>) {
      await ctx
        .http()
        .post(`/lab-orders/items/${item.id}/results`)
        .set(ctx.as('lab'))
        .send(results[item.testName])
        .expect(201);
    }

    const referral = await ctx
      .http()
      .post('/referrals')
      .set(ctx.as('junior'))
      .send({
        encounterId,
        type: 'INTERNAL',
        toUserId: ctx.ids.senior,
        reason: 'Please review anaemia work-up',
        urgency: 'URGENT',
      })
      .expect(201);
    referralId = referral.body.id;
  });

  afterAll(() => ctx.close());

  const inbox = async (who: string) =>
    (await ctx.http().get('/inbox').set(ctx.as(who)).expect(200)).body;

  describe('drafts', () => {
    it('a senior doctor sees every unsigned draft on open encounters', async () => {
      const body = await inbox('senior');
      const ids = body.drafts.map((d: { id: string }) => d.id).sort();
      expect(ids).toEqual([noteId, diagnosisId].sort());
      expect(body.counts.drafts).toBe(2);
      const note = body.drafts.find((d: { id: string }) => d.id === noteId);
      expect(note).toMatchObject({
        kind: 'note',
        encounterId,
        label: 'CONSULTATION',
        author: { fullName: 'junior' },
        patient: { id: patient.id, firstName: 'Inbox', lastName: 'Patient' },
      });
      const diagnosis = body.drafts.find((d: { id: string }) => d.id === diagnosisId);
      expect(diagnosis).toMatchObject({ kind: 'diagnosis', label: 'Iron deficiency anaemia' });
    });

    it('a junior doctor sees only the drafts they wrote', async () => {
      const junior = await inbox('junior');
      expect(junior.drafts.map((d: { id: string }) => d.id)).toEqual([noteId]);
      const junior2 = await inbox('junior2');
      expect(junior2.drafts.map((d: { id: string }) => d.id)).toEqual([diagnosisId]);
    });

    it('a signed note leaves the inbox', async () => {
      const extra = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, plan: 'Iron supplements' })
        .expect(201);
      expect((await inbox('junior')).counts.drafts).toBe(2);
      await ctx
        .http()
        .post(`/clinical-notes/${extra.body.id}/sign-off`)
        .set(ctx.as('senior'))
        .expect(201);
      const after = await inbox('junior');
      expect(after.drafts.map((d: { id: string }) => d.id)).toEqual([noteId]);
    });
  });

  describe('abnormal results', () => {
    it('flags low and high results and skips normal or unparseable ones', async () => {
      const body = await inbox('junior');
      const byTest = Object.fromEntries(
        body.abnormalResults.map((r: { testName: string; direction: string }) => [
          r.testName,
          r.direction,
        ]),
      );
      expect(byTest).toEqual({ Glucose: 'high', Haemoglobin: 'low', LDL: 'high', HDL: 'low' });
      expect(body.counts.abnormalResults).toBe(4);
      const glucose = body.abnormalResults.find(
        (r: { testName: string }) => r.testName === 'Glucose',
      );
      expect(glucose).toMatchObject({
        encounterId,
        resultValue: '126',
        unit: 'mg/dL',
        referenceRange: '70 to 100',
        patient: { id: patient.id },
      });
      expect(glucose.labOrderId).toEqual(expect.any(String));
    });

    it("only covers a doctor's own recent patients; admins see all", async () => {
      expect((await inbox('senior')).abnormalResults).toEqual([]);
      expect((await inbox('admin')).counts.abnormalResults).toBe(4);
    });
  });

  describe('referrals', () => {
    it('lists open internal referrals addressed to me only', async () => {
      const senior = await inbox('senior');
      expect(senior.referrals).toHaveLength(1);
      expect(senior.referrals[0]).toMatchObject({
        id: referralId,
        encounterId,
        reason: 'Please review anaemia work-up',
        urgency: 'URGENT',
        from: { fullName: 'junior' },
        patient: { id: patient.id },
      });
      expect(senior.counts.referrals).toBe(1);
      expect((await inbox('junior')).referrals).toEqual([]);
      expect((await inbox('junior2')).referrals).toEqual([]);
    });
  });

  describe('access', () => {
    it('refuses a patient token', async () => {
      await ctx.http().get('/inbox').set(patient.auth).expect(403);
    });

    it('refuses an anonymous request', async () => {
      await ctx.http().get('/inbox').expect(401);
    });

    it('gives a non-clinical role empty lists', async () => {
      const body = await inbox('billing');
      expect(body.counts).toEqual({ drafts: 0, abnormalResults: 0, referrals: 0 });
    });

    it('never shows another organisation', async () => {
      const body = await inbox('seniorB');
      expect(body).toEqual({
        drafts: [],
        abnormalResults: [],
        referrals: [],
        counts: { drafts: 0, abnormalResults: 0, referrals: 0 },
      });
    });
  });
});
