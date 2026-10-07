import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Invoice -> Payment -> Refund. Same conventions as
 * clinic-journey.e2e-spec.ts (scoped deleteMany, bcrypt cost 4). Covers
 * the money rules (server-computed totals, no overpayment, no
 * over-refund, void only when nothing is net-paid), the race the row
 * lock exists for, RBAC, tenant isolation, and the database-level
 * guarantees (REVOKE UPDATE/DELETE, CHECK constraints).
 */
describe('Billing (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;
  let appRole: PrismaClient;

  const orgA = { id: 'e2e-billing-org-a', name: 'E2E Billing Org A' };
  const orgB = { id: 'e2e-billing-org-b', name: 'E2E Billing Org B' };
  const password = 'billing-e2e-password';
  const patientPassword = 'billing-patient-password';

  let patientAId: string;
  let otherPatientAId: string;
  let billingToken: string;
  let receptionToken: string;
  let juniorToken: string;
  let adminBToken: string;

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

    const orgFilter = { organizationId: { in: [orgA.id, orgB.id] } };
    await admin.auditLog.deleteMany({ where: orgFilter });
    await admin.refund.deleteMany({ where: orgFilter });
    await admin.payment.deleteMany({ where: orgFilter });
    await admin.invoiceItem.deleteMany({ where: orgFilter });
    await admin.invoice.deleteMany({ where: orgFilter });
    await admin.encounter.deleteMany({ where: orgFilter });
    await admin.appointment.deleteMany({ where: orgFilter });
    await admin.user.deleteMany({ where: orgFilter });
    await admin.patient.deleteMany({ where: orgFilter });
    await admin.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });

    await admin.organization.create({ data: orgA });
    await admin.organization.create({ data: orgB });

    const hash = await bcrypt.hash(password, 4);
    const staff: Array<[string, string, StaffRole]> = [
      [orgA.id, 'billing@billing-a.example.com', StaffRole.BILLING],
      [orgA.id, 'reception@billing-a.example.com', StaffRole.RECEPTION],
      [orgA.id, 'junior@billing-a.example.com', StaffRole.JUNIOR_DOCTOR],
      [orgB.id, 'admin@billing-b.example.com', StaffRole.ADMINISTRATOR],
    ];
    for (const [organizationId, email, role] of staff) {
      await admin.user.create({
        data: { organizationId, email, passwordHash: hash, fullName: email, role },
      });
    }

    const patientA = await admin.patient.create({
      data: {
        organizationId: orgA.id,
        firstName: 'Billing',
        lastName: 'Patient',
        dateOfBirth: new Date('1985-03-03'),
        phone: '9777000001',
        email: 'patient@billing-a.example.com',
        passwordHash: await bcrypt.hash(patientPassword, 4),
      },
    });
    patientAId = patientA.id;
    const otherPatientA = await admin.patient.create({
      data: {
        organizationId: orgA.id,
        firstName: 'Other',
        lastName: 'Patient',
        dateOfBirth: new Date('1970-07-07'),
        phone: '9777000002',
      },
    });
    otherPatientAId = otherPatientA.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    billingToken = await login(orgA.id, 'billing@billing-a.example.com');
    receptionToken = await login(orgA.id, 'reception@billing-a.example.com');
    juniorToken = await login(orgA.id, 'junior@billing-a.example.com');
    adminBToken = await login(orgB.id, 'admin@billing-b.example.com');
  });

  afterAll(async () => {
    await app.close();
    await admin.$disconnect();
    await appRole.$disconnect();
  });

  async function login(organizationId: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId, email, password });
    return res.body.accessToken as string;
  }

  function issueInvoice(token: string, body: object) {
    return request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function pay(token: string, invoiceId: string, amountMinor: number, method = 'CASH') {
    return request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method, amountMinor });
  }

  function refund(token: string, paymentId: string, amountMinor: number) {
    return request(app.getHttpServer())
      .post(`/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountMinor, reason: 'Test refund' });
  }

  const consultation = {
    itemType: 'CONSULTATION',
    description: 'OPD consultation',
    quantity: 1,
    unitPriceMinor: 50000,
  };

  describe('issuing', () => {
    it('computes totals server-side and numbers invoices sequentially per org', async () => {
      const first = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [
          consultation,
          {
            itemType: 'PHARMACY',
            description: 'Tablets',
            quantity: 3,
            unitPriceMinor: 1000,
            taxMinor: 360,
          },
        ],
      }).expect(201);

      expect(first.body.subtotalMinor).toBe(53000);
      expect(first.body.taxMinor).toBe(360);
      expect(first.body.totalMinor).toBe(53360);
      expect(first.body.paidMinor).toBe(0);
      expect(first.body.status).toBe('ISSUED');
      expect(first.body.items).toHaveLength(2);
      expect(first.body.items[1].lineTotalMinor).toBe(3360);

      const second = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      expect(second.body.number).toBe(first.body.number + 1);
    });

    it('takes the patient from the encounter, and rejects a mismatched patientId', async () => {
      const appt = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: patientAId,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date().toISOString(),
        })
        .expect(201);
      const encounter = await request(app.getHttpServer())
        .post(`/appointments/${appt.body.id}/check-in`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .expect(201);

      const fromEncounter = await issueInvoice(billingToken, {
        encounterId: encounter.body.id,
        items: [consultation],
      }).expect(201);
      expect(fromEncounter.body.patientId).toBe(patientAId);
      expect(fromEncounter.body.encounterId).toBe(encounter.body.id);

      await issueInvoice(billingToken, {
        encounterId: encounter.body.id,
        patientId: otherPatientAId,
        items: [consultation],
      }).expect(400);
    });

    it('rejects negative amounts, empty item lists, and a client-supplied total is ignored', async () => {
      await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [{ ...consultation, unitPriceMinor: -1 }],
      }).expect(400);
      await issueInvoice(billingToken, { patientId: patientAId, items: [] }).expect(400);

      const res = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
        totalMinor: 1,
      }).expect(201);
      expect(res.body.totalMinor).toBe(50000);
    });

    it('issues concurrently without handing out the same number twice', async () => {
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          issueInvoice(billingToken, { patientId: patientAId, items: [consultation] }),
        ),
      );
      results.forEach((r) => expect(r.status).toBe(201));
      const numbers = new Set(results.map((r) => r.body.number));
      expect(numbers.size).toBe(3);
    });
  });

  describe('payments and refunds', () => {
    it('moves ISSUED -> PARTIALLY_PAID -> PAID and refuses overpayment', async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      const id = invoice.body.id;

      const partial = await pay(billingToken, id, 20000, 'UPI').expect(201);
      expect(partial.body.invoice.status).toBe('PARTIALLY_PAID');
      expect(partial.body.invoice.paidMinor).toBe(20000);

      await pay(billingToken, id, 30001).expect(409);

      const full = await pay(billingToken, id, 30000, 'CARD').expect(201);
      expect(full.body.invoice.status).toBe('PAID');

      await pay(billingToken, id, 1).expect(409);

      const detail = await request(app.getHttpServer())
        .get(`/invoices/${id}`)
        .set('Authorization', `Bearer ${billingToken}`)
        .expect(200);
      expect(detail.body.payments.map((p: { method: string }) => p.method)).toEqual([
        'UPI',
        'CARD',
      ]);
    });

    it('refunds up to the payment amount, recomputing the invoice status', async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      const paid = await pay(billingToken, invoice.body.id, 50000).expect(201);
      const paymentId = paid.body.payment.id;

      const first = await refund(billingToken, paymentId, 10000).expect(201);
      expect(first.body.invoice.status).toBe('PARTIALLY_PAID');
      expect(first.body.invoice.paidMinor).toBe(40000);

      await refund(billingToken, paymentId, 40001).expect(409);

      const rest = await refund(billingToken, paymentId, 40000).expect(201);
      expect(rest.body.invoice.status).toBe('ISSUED');
      expect(rest.body.invoice.paidMinor).toBe(0);
    });

    it('only voids an invoice with nothing net-paid, and a void invoice takes no payments', async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      const id = invoice.body.id;
      const paid = await pay(billingToken, id, 10000).expect(201);

      const voidReq = () =>
        request(app.getHttpServer())
          .post(`/invoices/${id}/void`)
          .set('Authorization', `Bearer ${billingToken}`)
          .send({ reason: 'Billed in error' });

      await voidReq().expect(409);
      await refund(billingToken, paid.body.payment.id, 10000).expect(201);

      const voided = await voidReq().expect(201);
      expect(voided.body.status).toBe('VOID');
      expect(voided.body.voidReason).toBe('Billed in error');

      await voidReq().expect(409);
      await pay(billingToken, id, 100).expect(409);
    });

    it('serializes concurrent payments so the invoice is never overpaid', async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);

      const results = await Promise.all([
        pay(billingToken, invoice.body.id, 50000),
        pay(billingToken, invoice.body.id, 50000),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

      const row = await admin.invoice.findUniqueOrThrow({ where: { id: invoice.body.id } });
      expect(row.paidMinor).toBe(50000);
      expect(await admin.payment.count({ where: { invoiceId: invoice.body.id } })).toBe(1);
    });
  });

  describe('RBAC', () => {
    it('limits billing actions to roles holding the billing permissions', async () => {
      await issueInvoice(juniorToken, { patientId: patientAId, items: [consultation] }).expect(403);
      await issueInvoice(receptionToken, { patientId: patientAId, items: [consultation] }).expect(
        403,
      );

      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      await pay(receptionToken, invoice.body.id, 100).expect(403);
      await request(app.getHttpServer())
        .get(`/invoices/${invoice.body.id}`)
        .set('Authorization', `Bearer ${juniorToken}`)
        .expect(403);
    });
  });

  describe('tenant isolation', () => {
    it("never lets org B see or pay org A's invoices", async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      const paid = await pay(billingToken, invoice.body.id, 100).expect(201);

      await request(app.getHttpServer())
        .get(`/invoices/${invoice.body.id}`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);
      await pay(adminBToken, invoice.body.id, 100).expect(404);
      await refund(adminBToken, paid.body.payment.id, 100).expect(404);
      await issueInvoice(adminBToken, { patientId: patientAId, items: [consultation] }).expect(404);

      const list = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });
  });

  describe('patient-facing', () => {
    it('shows a patient only their own invoices', async () => {
      await issueInvoice(billingToken, {
        patientId: otherPatientAId,
        items: [consultation],
      }).expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'patient@billing-a.example.com',
          password: patientPassword,
        })
        .expect(201);

      const mine = await request(app.getHttpServer())
        .get('/patients/me/invoices')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);
      expect(mine.body.length).toBeGreaterThan(0);
      mine.body.forEach((inv: { patientId: string }) => expect(inv.patientId).toBe(patientAId));

      await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(403);
    });
  });

  describe('audit', () => {
    it('records issue/payment/refund/void without item descriptions', async () => {
      const actions = await admin.auditLog.findMany({
        where: { organizationId: orgA.id },
        select: { action: true, metadata: true },
      });
      const names = new Set(actions.map((a) => a.action));
      ['invoice.issue', 'payment.record', 'refund.issue', 'invoice.void'].forEach((a) =>
        expect(names.has(a)).toBe(true),
      );
      expect(JSON.stringify(actions)).not.toContain('OPD consultation');
    });
  });

  describe('database-level guarantees', () => {
    it('refuses UPDATE/DELETE on payments, refunds and invoice items for the app role', async () => {
      for (const table of ['payments', 'refunds', 'invoice_items']) {
        await expect(
          appRole.$executeRawUnsafe(`UPDATE "${table}" SET "createdAt" = now()`),
        ).rejects.toThrow(/permission denied|42501/);
        await expect(appRole.$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow(
          /permission denied|42501/,
        );
      }
    });

    it('rejects a paidMinor above the total even when written directly', async () => {
      const invoice = await issueInvoice(billingToken, {
        patientId: patientAId,
        items: [consultation],
      }).expect(201);
      await expect(
        admin.invoice.update({ where: { id: invoice.body.id }, data: { paidMinor: 50001 } }),
      ).rejects.toThrow(/invoices_amounts_check/);
    });
  });
});
