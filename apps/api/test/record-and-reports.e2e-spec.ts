import { StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * The unified patient record's timeline (staff and patient views), the
 * administrator's reports and the billing desk's payments ledger. All
 * three are read-only views assembled from the source tables.
 */
describe('Patient timeline, reports and payments ledger (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-record-a', name: 'E2E Record A' };
  const orgB = { id: 'e2e-record-b', name: 'E2E Record B' };
  let pooja: { id: string; auth: { Authorization: string } };
  let other: { id: string; auth: { Authorization: string } };
  let encounterId: string;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'billing', organizationId: orgA.id, role: StaffRole.BILLING },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    pooja = await createPatientWithLogin(ctx, orgA.id, {
      email: 'pooja@record.example.com',
      phone: '9710000001',
    });
    other = await createPatientWithLogin(ctx, orgB.id, {
      email: 'other@record.example.com',
      phone: '9710000002',
    });
    encounterId = await checkedInEncounter(ctx, 'reception', pooja.id);

    // One signed diagnosis and one draft: the patient must see only the first.
    for (const [status, description] of [
      ['FINALIZED', 'Iron deficiency'],
      ['DRAFT', 'Working idea'],
    ] as const) {
      await ctx.admin.diagnosis.create({
        data: {
          organizationId: orgA.id,
          patientId: pooja.id,
          encounterId,
          status,
          currentVersionNumber: 1,
          versions: {
            create: {
              organizationId: orgA.id,
              versionNumber: 1,
              status,
              description,
              authorId: ctx.ids.senior!,
            },
          },
        },
      });
    }
    const invoice = await ctx.admin.invoice.create({
      data: {
        organizationId: orgA.id,
        patientId: pooja.id,
        encounterId,
        number: 1,
        status: 'PARTIALLY_PAID',
        subtotalMinor: 150000,
        taxMinor: 0,
        totalMinor: 150000,
        paidMinor: 50000,
        issuedById: ctx.ids.billing!,
      },
    });
    await ctx.admin.payment.create({
      data: {
        organizationId: orgA.id,
        invoiceId: invoice.id,
        method: 'UPI',
        amountMinor: 50000,
        reference: 'UPI-1',
        receivedById: ctx.ids.billing!,
      },
    });
    await ctx.admin.patientDocument.create({
      data: {
        organizationId: orgA.id,
        patientId: pooja.id,
        documentType: 'ID_PROOF',
        storageKey: 'local/id.pdf',
        fileName: 'id.pdf',
        mimeType: 'application/pdf',
        uploadedById: ctx.ids.reception!,
      },
    });
    await ctx.admin.patientConsent.create({
      data: {
        organizationId: orgA.id,
        patientId: pooja.id,
        consentType: 'TREATMENT',
        action: 'GRANTED',
        recordedById: ctx.ids.reception!,
      },
    });
  });

  afterAll(() => ctx.close());

  const kinds = (body: Array<{ kind: string }>) => [...new Set(body.map((e) => e.kind))].sort();

  describe('timeline', () => {
    it('gives staff the whole record, newest first, including drafts and admin rows', async () => {
      const res = await ctx
        .http()
        .get(`/patients/${pooja.id}/timeline`)
        .set(ctx.as('junior'))
        .expect(200);
      expect(kinds(res.body)).toEqual([
        'appointment',
        'consent',
        'diagnosis',
        'document',
        'invoice',
        'payment',
        'visit',
      ]);
      expect(res.body.filter((e: { kind: string }) => e.kind === 'diagnosis')).toHaveLength(2);
      const ats = res.body.map((e: { at: string }) => e.at);
      expect([...ats].sort().reverse()).toEqual(ats);
      expect(res.body.find((e: { kind: string }) => e.kind === 'payment').detail).toContain('500');
    });

    it('is clinical-only for staff and never crosses the tenant', async () => {
      await ctx.http().get(`/patients/${pooja.id}/timeline`).set(ctx.as('billing')).expect(403);
      await ctx.http().get(`/patients/${pooja.id}/timeline`).set(ctx.as('adminB')).expect(404);
    });

    it('gives the patient their own signed-off record only', async () => {
      const res = await ctx.http().get('/patients/me/timeline').set(pooja.auth).expect(200);
      expect(kinds(res.body)).toEqual(['appointment', 'diagnosis', 'invoice', 'payment', 'visit']);
      expect(res.body.filter((e: { kind: string }) => e.kind === 'diagnosis')).toHaveLength(1);
      expect(res.body[0]).not.toHaveProperty('authorId');

      const theirs = await ctx.http().get('/patients/me/timeline').set(other.auth).expect(200);
      expect(theirs.body).toEqual([]);
      await ctx.http().get('/patients/me/timeline').set(ctx.as('admin')).expect(403);
    });
  });

  describe('reports', () => {
    it('sums the range for administrators only', async () => {
      const res = await ctx
        .http()
        .get(`/reports/overview?from=${today}&to=${today}`)
        .set(ctx.as('admin'))
        .expect(200);
      expect(res.body.appointments.total).toBe(1);
      expect(res.body.appointments.byStatus.CHECKED_IN).toBe(1);
      expect(res.body.appointments.bySource.RECEPTION_WALK_IN).toBe(1);
      expect(res.body.patients.new).toBe(1);
      expect(res.body.money).toMatchObject({
        invoicedMinor: 150000,
        invoices: 1,
        collectedMinor: 50000,
        refundedMinor: 0,
        outstandingMinor: 100000,
        outstandingInvoices: 1,
      });
      expect(res.body.topDiagnoses).toEqual([
        { description: 'Iron deficiency', icdCode: null, count: 1 },
      ]);
      expect(res.body.perDay).toEqual([{ date: today, visits: 1, collectedMinor: 50000 }]);
      expect(JSON.stringify(res.body)).not.toContain('Patient');

      await ctx.http().get('/reports/overview').set(ctx.as('reception')).expect(403);
      await ctx.http().get('/reports/overview').set(ctx.as('senior')).expect(403);
    });

    it('refuses bad ranges', async () => {
      await ctx.http().get('/reports/overview?from=2026-13-01').set(ctx.as('admin')).expect(400);
      await ctx
        .http()
        .get('/reports/overview?from=2026-10-10&to=2026-10-01')
        .set(ctx.as('admin'))
        .expect(400);
      await ctx
        .http()
        .get('/reports/overview?from=2024-01-01&to=2026-10-01')
        .set(ctx.as('admin'))
        .expect(400);
    });

    it('sees nothing from another organisation', async () => {
      const res = await ctx
        .http()
        .get(`/reports/overview?from=${today}&to=${today}`)
        .set(ctx.as('adminB'))
        .expect(200);
      expect(res.body.appointments.total).toBe(0);
      expect(res.body.money.collectedMinor).toBe(0);
    });
  });

  describe('payments ledger', () => {
    it('lists the range for the billing desk, with invoice and patient', async () => {
      const res = await ctx.http().get('/payments').set(ctx.as('billing')).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        method: 'UPI',
        amountMinor: 50000,
        reference: 'UPI-1',
        invoice: { number: 1, status: 'PARTIALLY_PAID', patient: { id: pooja.id } },
        receivedBy: { fullName: 'billing' },
        refunds: [],
      });
      const empty = await ctx
        .http()
        .get('/payments?from=2020-01-01&to=2020-01-31')
        .set(ctx.as('billing'))
        .expect(200);
      expect(empty.body).toEqual([]);
      await ctx.http().get('/payments').set(ctx.as('nurse')).expect(403);
      await ctx.http().get('/payments?from=2026-02-30').set(ctx.as('billing')).expect(400);
    });
  });
});
