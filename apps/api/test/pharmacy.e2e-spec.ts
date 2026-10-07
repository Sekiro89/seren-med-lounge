import { PrismaClient, StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Catalogue -> stock receipt -> FEFO dispensing against a prescription
 * -> pickup / home delivery / cancellation (stock returned).
 */
describe('Pharmacy and inventory (e2e)', () => {
  let ctx: TestContext;
  let appRole: PrismaClient;
  const orgA = { id: 'e2e-pharm-org-a', name: 'E2E Pharmacy Org A' };
  const orgB = { id: 'e2e-pharm-org-b', name: 'E2E Pharmacy Org B' };
  let patient: { id: string; auth: { Authorization: string } };

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'pharmacy', organizationId: orgA.id, role: StaffRole.PHARMACY },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@pharm-a.example.com',
      phone: '9555000001',
    });
  });

  afterAll(async () => {
    await appRole.$disconnect();
    await ctx.close();
  });

  async function newMedication(name: string, reorderLevel?: number) {
    const res = await ctx
      .http()
      .post('/medications')
      .set(ctx.as('pharmacy'))
      .send({ name, form: 'TABLET', strength: '500 mg', unit: 'tablet', reorderLevel })
      .expect(201);
    return res.body.id as string;
  }

  function receive(
    medicationId: string,
    batchNumber: string,
    expiryDate: string,
    quantity: number,
  ) {
    return ctx
      .http()
      .post('/stock/batches')
      .set(ctx.as('pharmacy'))
      .send({ medicationId, batchNumber, expiryDate, quantity });
  }

  async function prescriptionItem() {
    const encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
    const res = await ctx
      .http()
      .post('/prescriptions')
      .set(ctx.as('senior'))
      .send({
        encounterId,
        items: [{ medicationName: 'Paracetamol 500', dosage: '1 tab', frequency: 'TDS' }],
      })
      .expect(201);
    return { prescriptionId: res.body.id as string, itemId: res.body.items[0].id as string };
  }

  function dispense(body: object, who = 'pharmacy') {
    return ctx.http().post('/dispensings').set(ctx.as(who)).send(body);
  }

  describe('catalogue and stock', () => {
    it('manages the catalogue with inventory:manage only, and searches it', async () => {
      await newMedication('Paracetamol');
      await ctx
        .http()
        .post('/medications')
        .set(ctx.as('reception'))
        .send({ name: 'X', form: 'TABLET', unit: 'tablet' })
        .expect(403);
      const found = await ctx
        .http()
        .get('/medications?search=paraceta')
        .set(ctx.as('pharmacy'))
        .expect(200);
      expect(found.body.map((m: { name: string }) => m.name)).toContain('Paracetamol');
    });

    it('receives batches, tops up a repeat batch, and refuses expired or mismatched ones', async () => {
      const med = await newMedication('Amoxicillin');
      await receive(med, 'B1', '2020-01-01', 10).expect(400);
      const first = await receive(med, 'B1', '2031-01-01', 10).expect(201);
      const again = await receive(med, 'B1', '2031-01-01', 5).expect(201);
      expect(again.body.id).toBe(first.body.id);
      expect(again.body.quantityOnHand).toBe(15);
      await receive(med, 'B1', '2032-01-01', 5).expect(409);

      await ctx
        .http()
        .post(`/stock/batches/${first.body.id}/adjust`)
        .set(ctx.as('pharmacy'))
        .send({ type: 'WASTAGE', quantityDelta: 3, reason: 'Damaged' })
        .expect(400);
      await ctx
        .http()
        .post(`/stock/batches/${first.body.id}/adjust`)
        .set(ctx.as('pharmacy'))
        .send({ type: 'WASTAGE', quantityDelta: -16, reason: 'Damaged' })
        .expect(409);
      const wasted = await ctx
        .http()
        .post(`/stock/batches/${first.body.id}/adjust`)
        .set(ctx.as('pharmacy'))
        .send({ type: 'WASTAGE', quantityDelta: -3, reason: 'Damaged strip' })
        .expect(201);
      expect(wasted.body.quantityOnHand).toBe(12);

      const movements = await ctx
        .http()
        .get(`/stock/movements?batchId=${first.body.id}`)
        .set(ctx.as('pharmacy'))
        .expect(200);
      expect(movements.body.map((m: { type: string }) => m.type).sort()).toEqual([
        'RECEIPT',
        'RECEIPT',
        'WASTAGE',
      ]);
    });

    it('lists low stock against reorderLevel and soon-expiring batches', async () => {
      const med = await newMedication('Cetirizine', 20);
      await receive(med, 'C1', '2031-06-01', 10).expect(201);
      const low = await ctx.http().get('/stock/low').set(ctx.as('pharmacy')).expect(200);
      expect(low.body.find((m: { id: string }) => m.id === med)?.usableOnHand).toBe(10);

      const expiring = await ctx
        .http()
        .get('/stock/expiring?days=3650')
        .set(ctx.as('pharmacy'))
        .expect(200);
      expect(expiring.body.some((b: { batchNumber: string }) => b.batchNumber === 'C1')).toBe(true);
    });
  });

  describe('dispensing', () => {
    it('allocates first-expiry-first and never touches expired stock', async () => {
      const med = await newMedication('Metformin');
      const later = await receive(med, 'LATE', '2032-01-01', 5).expect(201);
      const sooner = await receive(med, 'SOON', '2030-06-01', 5).expect(201);
      const expired = await ctx.admin.stockBatch.create({
        data: {
          organizationId: orgA.id,
          medicationId: med,
          batchNumber: 'OLD',
          expiryDate: new Date('2020-01-01'),
          quantityReceived: 100,
          quantityOnHand: 100,
          receivedById: ctx.ids.pharmacy!,
        },
      });

      const { itemId } = await prescriptionItem();
      const pending = await ctx.http().get('/pharmacy/pending').set(ctx.as('pharmacy')).expect(200);
      expect(pending.body.map((i: { id: string }) => i.id)).toContain(itemId);

      const res = await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 7,
        mode: 'PICKUP',
      }).expect(201);
      expect(res.body.status).toBe('PREPARED');
      expect(res.body.allocations).toEqual([
        { batchId: sooner.body.id, quantity: 5 },
        { batchId: later.body.id, quantity: 2 },
      ]);

      const batches = await ctx.admin.stockBatch.findMany({ where: { medicationId: med } });
      const byId = new Map(batches.map((b) => [b.id, b.quantityOnHand]));
      expect(byId.get(sooner.body.id)).toBe(0);
      expect(byId.get(later.body.id)).toBe(3);
      expect(byId.get(expired.id)).toBe(100);

      const after = await ctx.http().get('/pharmacy/pending').set(ctx.as('pharmacy')).expect(200);
      expect(after.body.map((i: { id: string }) => i.id)).not.toContain(itemId);

      // Only 3 usable left (the 100 expired don't count) — refused, nothing written.
      const { itemId: item2 } = await prescriptionItem();
      await dispense({
        prescriptionItemId: item2,
        medicationId: med,
        quantity: 4,
        mode: 'PICKUP',
      }).expect(409);
      expect(await ctx.admin.dispensing.count({ where: { prescriptionItemId: item2 } })).toBe(0);
    });

    it('follows pickup and delivery paths, and cancelling returns the stock', async () => {
      const med = await newMedication('Atorvastatin');
      const batch = await receive(med, 'A1', '2031-01-01', 20).expect(201);
      const { itemId } = await prescriptionItem();

      const pickup = await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 5,
        mode: 'PICKUP',
      }).expect(201);
      await ctx
        .http()
        .post(`/dispensings/${pickup.body.id}/dispatch`)
        .set(ctx.as('pharmacy'))
        .expect(409);
      await ctx
        .http()
        .post(`/dispensings/${pickup.body.id}/hand-over`)
        .set(ctx.as('pharmacy'))
        .expect(201);
      await ctx
        .http()
        .post(`/dispensings/${pickup.body.id}/cancel`)
        .set(ctx.as('pharmacy'))
        .expect(409);

      await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 5,
        mode: 'HOME_DELIVERY',
      }).expect(400);
      const delivery = await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 5,
        mode: 'HOME_DELIVERY',
        deliveryAddress: '12 MG Road',
      }).expect(201);
      await ctx
        .http()
        .post(`/dispensings/${delivery.body.id}/deliver`)
        .set(ctx.as('pharmacy'))
        .expect(409);
      await ctx
        .http()
        .post(`/dispensings/${delivery.body.id}/dispatch`)
        .set(ctx.as('pharmacy'))
        .expect(201);
      const delivered = await ctx
        .http()
        .post(`/dispensings/${delivery.body.id}/deliver`)
        .set(ctx.as('pharmacy'))
        .expect(201);
      expect(delivered.body.status).toBe('DELIVERED');
      expect(delivered.body.deliveredAt).toBeTruthy();

      const toCancel = await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 4,
        mode: 'PICKUP',
      }).expect(201);
      expect(
        (await ctx.admin.stockBatch.findUniqueOrThrow({ where: { id: batch.body.id } }))
          .quantityOnHand,
      ).toBe(6);
      await ctx
        .http()
        .post(`/dispensings/${toCancel.body.id}/cancel`)
        .set(ctx.as('pharmacy'))
        .expect(201);
      expect(
        (await ctx.admin.stockBatch.findUniqueOrThrow({ where: { id: batch.body.id } }))
          .quantityOnHand,
      ).toBe(10);
    });

    it('refuses to dispense against a cancelled prescription or by a non-pharmacy role', async () => {
      const med = await newMedication('Omeprazole');
      await receive(med, 'O1', '2031-01-01', 20).expect(201);
      const { prescriptionId, itemId } = await prescriptionItem();
      await dispense(
        { prescriptionItemId: itemId, medicationId: med, quantity: 1, mode: 'PICKUP' },
        'reception',
      ).expect(403);
      await ctx
        .http()
        .post(`/prescriptions/${prescriptionId}/cancel`)
        .set(ctx.as('senior'))
        .expect(201);
      await dispense({
        prescriptionItemId: itemId,
        medicationId: med,
        quantity: 1,
        mode: 'PICKUP',
      }).expect(409);
    });

    it('serializes concurrent dispensing of the last units', async () => {
      const med = await newMedication('Losartan');
      await receive(med, 'L1', '2031-01-01', 5).expect(201);
      const { itemId } = await prescriptionItem();
      const results = await Promise.all([
        dispense({ prescriptionItemId: itemId, medicationId: med, quantity: 4, mode: 'PICKUP' }),
        dispense({ prescriptionItemId: itemId, medicationId: med, quantity: 4, mode: 'PICKUP' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('shows the patient their dispensings without stock internals', async () => {
      const mine = await ctx.http().get('/patients/me/dispensings').set(patient.auth).expect(200);
      expect(mine.body.length).toBeGreaterThan(0);
      expect(mine.body[0]).not.toHaveProperty('dispensedById');
      expect(mine.body[0].medication.name).toBeDefined();
    });
  });

  describe('isolation and database guarantees', () => {
    it("keeps org B out of org A's pharmacy", async () => {
      const med = await newMedication('Isolated');
      const { itemId } = await prescriptionItem();
      await dispense(
        { prescriptionItemId: itemId, medicationId: med, quantity: 1, mode: 'PICKUP' },
        'adminB',
      ).expect(404);
      const meds = await ctx.http().get('/medications').set(ctx.as('adminB')).expect(200);
      expect(meds.body).toHaveLength(0);
    });

    it('refuses stock-ledger edits and negative stock at the database', async () => {
      await expect(
        appRole.$executeRawUnsafe('UPDATE "stock_movements" SET "reason" = \'x\''),
      ).rejects.toThrow(/permission denied|42501/);
      const batch = await ctx.admin.stockBatch.findFirstOrThrow({
        where: { organizationId: orgA.id },
      });
      await expect(
        ctx.admin.stockBatch.update({ where: { id: batch.id }, data: { quantityOnHand: -1 } }),
      ).rejects.toThrow(/stock_batches_quantity_check/);
    });
  });
});
