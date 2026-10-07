import { PrismaClient, StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Insurance: policy -> case (eligibility -> pre-auth -> claim ->
 * settlement), with settlement recorded as a Payment(method INSURANCE)
 * on the linked invoice in the same transaction.
 */
describe('Insurance (e2e)', () => {
  let ctx: TestContext;
  let appRole: PrismaClient;
  const orgA = { id: 'e2e-insurance-org-a', name: 'E2E Insurance Org A' };
  const orgB = { id: 'e2e-insurance-org-b', name: 'E2E Insurance Org B' };
  let patient: { id: string; auth: { Authorization: string } };
  let otherPatient: { id: string; auth: { Authorization: string } };
  let encounterId: string;

  const NOTE_TEXT = 'Spoke to TPA desk: awaiting discharge summary';

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'insurer', organizationId: orgA.id, role: StaffRole.INSURANCE },
        { key: 'billing', organizationId: orgA.id, role: StaffRole.BILLING },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'adminA', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@insurance-a.example.com',
      phone: '9555000001',
    });
    otherPatient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'other@insurance-a.example.com',
      phone: '9555000002',
      firstName: 'Other',
    });
    encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
  });

  afterAll(async () => {
    await appRole.$disconnect();
    await ctx.close();
  });

  async function document(patientId: string, documentType = 'INSURANCE_CARD') {
    const doc = await ctx.admin.patientDocument.create({
      data: {
        organizationId: orgA.id,
        patientId,
        documentType: documentType as 'INSURANCE_CARD',
        storageKey: `card-${Date.now()}-${Math.random()}`,
        fileName: 'card.pdf',
        mimeType: 'application/pdf',
        uploadedById: ctx.ids.reception!,
      },
    });
    return doc.id;
  }

  async function invoice(totalMinor: number, patientId = patient.id) {
    const res = await ctx
      .http()
      .post('/invoices')
      .set(ctx.as('billing'))
      .send({
        patientId,
        items: [
          {
            itemType: 'PROCEDURE',
            description: 'Day-care procedure',
            quantity: 1,
            unitPriceMinor: totalMinor,
          },
        ],
      })
      .expect(201);
    return res.body.id as string;
  }

  function policy(overrides: object = {}, who = 'insurer') {
    return ctx
      .http()
      .post('/insurance/policies')
      .set(ctx.as(who))
      .send({
        patientId: patient.id,
        insurerName: 'Star Health',
        tpaName: 'MediAssist',
        policyNumber: `POL-${Date.now()}-${Math.random()}`,
        ...overrides,
      });
  }

  function openCase(body: object, who = 'insurer') {
    return ctx.http().post('/insurance/cases').set(ctx.as(who)).send(body);
  }

  function move(caseId: string, body: object, who = 'insurer') {
    return ctx.http().post(`/insurance/cases/${caseId}/transition`).set(ctx.as(who)).send(body);
  }

  function settle(caseId: string, body: object, who = 'insurer') {
    return ctx.http().post(`/insurance/cases/${caseId}/settle`).set(ctx.as(who)).send(body);
  }

  /** Walks a new case to CLAIM_PARTIALLY_APPROVED with the given approved amount. */
  async function approvedCase(policyId: string, invoiceId: string | undefined, approved: number) {
    const c = await openCase({ policyId, invoiceId, requestedAmountMinor: approved }).expect(201);
    await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED', reference: 'PA-1' }).expect(201);
    await move(c.body.id, { toStatus: 'PRE_AUTH_APPROVED', amountMinor: approved }).expect(201);
    await move(c.body.id, { toStatus: 'CLAIM_SUBMITTED', reference: 'CL-1' }).expect(201);
    await move(c.body.id, { toStatus: 'CLAIM_PARTIALLY_APPROVED', amountMinor: approved }).expect(
      201,
    );
    return c.body.id as string;
  }

  describe('policies', () => {
    it('creates a policy with this patient’s insurance card and lists it', async () => {
      const cardDocumentId = await document(patient.id);
      const res = await policy({
        cardDocumentId,
        memberId: 'M-1',
        sumInsuredMinor: 50_000_000,
        validFrom: '2026-01-01',
        validTo: '2027-12-31',
      }).expect(201);
      expect(res.body).toMatchObject({ patientId: patient.id, isActive: true, cardDocumentId });

      const list = await ctx
        .http()
        .get(`/insurance/policies?patientId=${patient.id}`)
        .set(ctx.as('insurer'))
        .expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toContain(res.body.id);
    });

    it('rejects a card document of another patient or of the wrong type (400)', async () => {
      await policy({ cardDocumentId: await document(otherPatient.id) }).expect(400);
      await policy({ cardDocumentId: await document(patient.id, 'PAN_CARD') }).expect(400);
    });

    it('validates input (400)', async () => {
      await policy({ insurerName: '' }).expect(400);
      await policy({ validFrom: '2027-01-01', validTo: '2026-01-01' }).expect(400);
      await policy({ sumInsuredMinor: 10.5 }).expect(400);
    });

    it('deactivates once; an inactive policy cannot open a case (409)', async () => {
      const p = await policy().expect(201);
      await ctx
        .http()
        .post(`/insurance/policies/${p.body.id}/deactivate`)
        .set(ctx.as('insurer'))
        .expect(201);
      await ctx
        .http()
        .post(`/insurance/policies/${p.body.id}/deactivate`)
        .set(ctx.as('insurer'))
        .expect(409);
      await openCase({ policyId: p.body.id }).expect(409);
    });

    it('refuses a case on an expired or not-yet-valid policy (409)', async () => {
      const expired = await policy({ validFrom: '2020-01-01', validTo: '2021-01-01' }).expect(201);
      await openCase({ policyId: expired.body.id }).expect(409);
      const future = await policy({ validFrom: '2099-01-01' }).expect(201);
      await openCase({ policyId: future.body.id }).expect(409);
    });

    it('patient sees only their own policies', async () => {
      const mine = await policy().expect(201);
      const theirs = await policy({ patientId: otherPatient.id }).expect(201);
      const res = await ctx
        .http()
        .get('/patients/me/insurance-policies')
        .set(patient.auth)
        .expect(200);
      const ids = res.body.map((p: { id: string }) => p.id);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.body.id);
      await ctx.http().get('/patients/me/insurance-policies').set(ctx.as('insurer')).expect(403);
    });
  });

  describe('cases', () => {
    let policyId: string;

    beforeAll(async () => {
      policyId = (await policy({ validFrom: '2026-01-01', validTo: '2027-12-31' }).expect(201)).body
        .id;
    });

    it('happy path: policy -> case -> pre-auth -> claim -> partial approval -> settle', async () => {
      const invoiceId = await invoice(100_000);
      const created = await openCase({
        policyId,
        encounterId,
        invoiceId,
        requestedAmountMinor: 100_000,
      }).expect(201);
      const caseId = created.body.id;
      expect(created.body.status).toBe('ELIGIBILITY_CHECK');
      expect(created.body.events).toHaveLength(1);
      expect(created.body.events[0]).toMatchObject({
        fromStatus: null,
        toStatus: 'ELIGIBILITY_CHECK',
      });

      const req = await move(caseId, { toStatus: 'PRE_AUTH_REQUESTED', reference: 'PA-777' });
      expect(req.status).toBe(201);
      expect(req.body.preAuthReference).toBe('PA-777');

      await move(caseId, { toStatus: 'PRE_AUTH_APPROVED' }).expect(400);
      const pa = await move(caseId, {
        toStatus: 'PRE_AUTH_APPROVED',
        amountMinor: 80_000,
      }).expect(201);
      expect(pa.body.approvedAmountMinor).toBe(80_000);

      await ctx
        .http()
        .post(`/insurance/cases/${caseId}/notes`)
        .set(ctx.as('insurer'))
        .send({ note: NOTE_TEXT })
        .expect(201);

      const cs = await move(caseId, {
        toStatus: 'CLAIM_SUBMITTED',
        reference: 'CLM-9',
        note: NOTE_TEXT,
      }).expect(201);
      expect(cs.body.claimReference).toBe('CLM-9');

      // SETTLED is only reachable through /settle.
      await move(caseId, { toStatus: 'SETTLED', amountMinor: 1 }).expect(400);

      const partial = await move(caseId, {
        toStatus: 'CLAIM_PARTIALLY_APPROVED',
        amountMinor: 60_000,
      }).expect(201);
      expect(partial.body.approvedAmountMinor).toBe(60_000);

      await move(caseId, { toStatus: 'CLOSED' }).expect(409);
      await settle(caseId, { amountMinor: 60_001 }).expect(409);

      const settled = await settle(caseId, { amountMinor: 60_000, reference: 'UTR-1' }).expect(201);
      expect(settled.body.case).toMatchObject({ status: 'SETTLED', settledAmountMinor: 60_000 });
      expect(settled.body.payment).toMatchObject({
        method: 'INSURANCE',
        amountMinor: 60_000,
        invoiceId,
      });

      const inv = await ctx.admin.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(inv).toMatchObject({ status: 'PARTIALLY_PAID', paidMinor: 60_000 });

      await settle(caseId, { amountMinor: 1 }).expect(409);
      await move(caseId, { toStatus: 'CLOSED' }).expect(201);

      const detail = await ctx
        .http()
        .get(`/insurance/cases/${caseId}`)
        .set(ctx.as('insurer'))
        .expect(200);
      expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
        'ELIGIBILITY_CHECK',
        'PRE_AUTH_REQUESTED',
        'PRE_AUTH_APPROVED',
        'PRE_AUTH_APPROVED',
        'CLAIM_SUBMITTED',
        'CLAIM_PARTIALLY_APPROVED',
        'SETTLED',
        'CLOSED',
      ]);
      const noteEvent = detail.body.events[3];
      expect(noteEvent).toMatchObject({
        fromStatus: 'PRE_AUTH_APPROVED',
        toStatus: 'PRE_AUTH_APPROVED',
        note: NOTE_TEXT,
      });

      const list = await ctx
        .http()
        .get(`/insurance/cases?status=CLOSED&patientId=${patient.id}`)
        .set(ctx.as('insurer'))
        .expect(200);
      expect(list.body.map((c: { id: string }) => c.id)).toContain(caseId);
      await ctx.http().get('/insurance/cases?status=NOPE').set(ctx.as('insurer')).expect(400);
    });

    it('full approval settles the invoice to PAID', async () => {
      const invoiceId = await invoice(30_000);
      const c = await openCase({ policyId, invoiceId }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_APPROVED', amountMinor: 30_000 }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_SUBMITTED' }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_APPROVED', amountMinor: 30_000 }).expect(201);
      await settle(c.body.id, { amountMinor: 30_000 }).expect(201);
      const inv = await ctx.admin.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      expect(inv).toMatchObject({ status: 'PAID', paidMinor: 30_000 });
    });

    it('enforces the state machine (409)', async () => {
      const c = await openCase({ policyId }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_SUBMITTED' }).expect(409);
      await move(c.body.id, { toStatus: 'PRE_AUTH_APPROVED', amountMinor: 1 }).expect(409);
      await settle(c.body.id, { amountMinor: 1 }).expect(409);
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_DENIED', note: 'Not covered' }).expect(201);
      // Resubmission after denial.
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_DENIED' }).expect(201);
      await move(c.body.id, { toStatus: 'CLOSED' }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }).expect(409);
    });

    it('allows claim resubmission after rejection', async () => {
      const c = await openCase({ policyId }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }).expect(201);
      await move(c.body.id, { toStatus: 'PRE_AUTH_APPROVED', amountMinor: 5_000 }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_SUBMITTED' }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_REJECTED' }).expect(201);
      await move(c.body.id, { toStatus: 'CLAIM_SUBMITTED' }).expect(201);
    });

    it('refuses settlement without a linked invoice (409)', async () => {
      const caseId = await approvedCase(policyId, undefined, 10_000);
      await settle(caseId, { amountMinor: 10_000 }).expect(409);
    });

    it('still applies the invoice outstanding-balance rule (409)', async () => {
      const invoiceId = await invoice(50_000);
      await ctx
        .http()
        .post(`/invoices/${invoiceId}/payments`)
        .set(ctx.as('billing'))
        .send({ method: 'CASH', amountMinor: 40_000 })
        .expect(201);
      const caseId = await approvedCase(policyId, invoiceId, 20_000);
      await settle(caseId, { amountMinor: 20_000 }).expect(409);
      const c = await ctx.admin.insuranceCase.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.status).toBe('CLAIM_PARTIALLY_APPROVED');
      await settle(caseId, { amountMinor: 10_000 }).expect(201);
    });

    it('requires linked records to belong to the policy’s patient (400)', async () => {
      const otherInvoice = await invoice(1_000, otherPatient.id);
      await openCase({ policyId, invoiceId: otherInvoice }).expect(400);
      const otherEncounter = await checkedInEncounter(ctx, 'reception', otherPatient.id);
      await openCase({ policyId, encounterId: otherEncounter }).expect(400);
      await openCase({ policyId, invoiceId: 'missing' }).expect(404);
    });

    it('the billing desk still cannot post method INSURANCE (400)', async () => {
      const invoiceId = await invoice(1_000);
      await ctx
        .http()
        .post(`/invoices/${invoiceId}/payments`)
        .set(ctx.as('billing'))
        .send({ method: 'INSURANCE', amountMinor: 500 })
        .expect(400);
    });
  });

  describe('access control and isolation', () => {
    it('BILLING lacks insurance:manage (403); ADMINISTRATOR has it', async () => {
      await policy({}, 'billing').expect(403);
      await ctx.http().get('/insurance/cases').set(ctx.as('billing')).expect(403);
      await policy({}, 'adminA').expect(201);
    });

    it('another organization sees nothing (404 / empty)', async () => {
      const p = await policy().expect(201);
      const c = await openCase({ policyId: p.body.id }).expect(201);
      await ctx.http().get(`/insurance/cases/${c.body.id}`).set(ctx.as('adminB')).expect(404);
      await move(c.body.id, { toStatus: 'PRE_AUTH_REQUESTED' }, 'adminB').expect(404);
      await openCase({ policyId: p.body.id }, 'adminB').expect(404);
      await ctx
        .http()
        .post(`/insurance/policies/${p.body.id}/deactivate`)
        .set(ctx.as('adminB'))
        .expect(404);
      const cases = await ctx.http().get('/insurance/cases').set(ctx.as('adminB')).expect(200);
      expect(cases.body).toEqual([]);
      const policies = await ctx
        .http()
        .get('/insurance/policies')
        .set(ctx.as('adminB'))
        .expect(200);
      expect(policies.body).toEqual([]);
      await policy({}, 'adminB').expect(404);
    });
  });

  describe('audit and database guarantees', () => {
    it('audits every write without the communication-log text', async () => {
      const logs = await ctx.admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const actions = new Set(logs.map((l) => l.action));
      [
        'insurance.policy_create',
        'insurance.policy_deactivate',
        'insurance.case_create',
        'insurance.case_transition',
        'insurance.case_note',
        'insurance.case_settle',
        'payment.record',
      ].forEach((a) => expect(actions.has(a)).toBe(true));
      const settleLog = logs.find(
        (l) => l.action === 'payment.record' && JSON.stringify(l.metadata).includes('INSURANCE'),
      );
      expect(settleLog).toBeDefined();
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(NOTE_TEXT);
      expect(serialized).not.toContain('Not covered');
    });

    it('refuses UPDATE/DELETE on insurance_case_events for the app role', async () => {
      await expect(
        appRole.$executeRawUnsafe(`UPDATE "insurance_case_events" SET "note" = 'x'`),
      ).rejects.toThrow(/permission denied|42501/);
      await expect(
        appRole.$executeRawUnsafe(`DELETE FROM "insurance_case_events"`),
      ).rejects.toThrow(/permission denied|42501/);
    });
  });
});
