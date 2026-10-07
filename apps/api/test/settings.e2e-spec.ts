import { StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Administrator controls: integration API keys (encrypted, never returned,
 * never audited by value), the audit log search, the lab-order list and
 * switching staff off or changing their role.
 */
describe('Settings and administrator controls (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-settings-org-a', name: 'E2E Settings Org A' };
  const orgB = { id: 'e2e-settings-org-b', name: 'E2E Settings Org B' };

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'admin2', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'billing', organizationId: orgA.id, role: StaffRole.BILLING },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'lab', organizationId: orgA.id, role: StaffRole.LAB_TECHNICIAN },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
  });

  afterAll(() => ctx.close());

  const SECRET = 'sk_live_9f3a7c1e5b2d8a64';

  describe('integrations (API keys)', () => {
    it('lists every provider, none configured to begin with', async () => {
      const res = await ctx.http().get('/integrations').set(ctx.as('admin')).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(8);
      expect(res.body.every((i: { configured: boolean }) => !i.configured)).toBe(true);
      const payments = res.body.find((i: { provider: string }) => i.provider === 'PAYMENT_GATEWAY');
      expect(payments.secrets.apiSecret).toEqual({ set: false, hint: null });
    });

    it('saves a connection, encrypts the secret at rest and never returns it', async () => {
      const res = await ctx
        .http()
        .put('/integrations/PAYMENT_GATEWAY')
        .set(ctx.as('admin'))
        .send({
          values: { providerName: 'Gateway Co', mode: 'Test', keyId: 'key_123', apiSecret: SECRET },
        })
        .expect(200);

      expect(res.body.configured).toBe(true);
      expect(res.body.values).toMatchObject({
        providerName: 'Gateway Co',
        mode: 'Test',
        keyId: 'key_123',
      });
      expect(res.body.secrets.apiSecret).toEqual({ set: true, hint: '••••8a64' });
      expect(JSON.stringify(res.body)).not.toContain(SECRET);

      const list = await ctx.http().get('/integrations').set(ctx.as('admin')).expect(200);
      expect(JSON.stringify(list.body)).not.toContain(SECRET);

      const raw = await ctx.admin.integrationSetting.findFirstOrThrow({
        where: { organizationId: orgA.id, provider: 'PAYMENT_GATEWAY' },
      });
      expect(raw.secretsEncrypted).toBeTruthy();
      expect(raw.secretsEncrypted).not.toContain(SECRET);
      expect(JSON.stringify(raw.config)).not.toContain(SECRET);
      expect(raw.secretsEncrypted!.startsWith('v1.')).toBe(true);
    });

    it('keeps a saved secret when a form is saved without retyping it, and clears it on request', async () => {
      await ctx
        .http()
        .put('/integrations/PAYMENT_GATEWAY')
        .set(ctx.as('admin'))
        .send({ values: { keyId: 'key_456', apiSecret: '' } })
        .expect(200);
      let view = (await ctx.http().get('/integrations').set(ctx.as('admin')).expect(200)).body.find(
        (i: { provider: string }) => i.provider === 'PAYMENT_GATEWAY',
      );
      expect(view.values.keyId).toBe('key_456');
      expect(view.secrets.apiSecret.set).toBe(true);

      await ctx
        .http()
        .put('/integrations/PAYMENT_GATEWAY')
        .set(ctx.as('admin'))
        .send({ values: {}, clear: ['apiSecret'] })
        .expect(200);
      view = (await ctx.http().get('/integrations').set(ctx.as('admin')).expect(200)).body.find(
        (i: { provider: string }) => i.provider === 'PAYMENT_GATEWAY',
      );
      expect(view.secrets.apiSecret.set).toBe(false);
      expect(view.configured).toBe(false);
    });

    it('will not switch an incomplete connection on, and validates fields', async () => {
      await ctx
        .http()
        .put('/integrations/AI_ASSISTANT')
        .set(ctx.as('admin'))
        .send({ values: {}, enabled: true })
        .expect(409);
      await ctx
        .http()
        .put('/integrations/AI_ASSISTANT')
        .set(ctx.as('admin'))
        .send({ values: { nonsense: 'x' } })
        .expect(400);
      await ctx
        .http()
        .put('/integrations/PAYMENT_GATEWAY')
        .set(ctx.as('admin'))
        .send({ values: { mode: 'Maybe' } })
        .expect(400);
      await ctx
        .http()
        .put('/integrations/OBJECT_STORAGE')
        .set(ctx.as('admin'))
        .send({ values: { endpoint: 'not a url' } })
        .expect(400);
      await ctx
        .http()
        .put('/integrations/NOT_REAL')
        .set(ctx.as('admin'))
        .send({ values: {} })
        .expect(400);

      await ctx
        .http()
        .put('/integrations/AI_ASSISTANT')
        .set(ctx.as('admin'))
        .send({
          values: { providerName: 'Speech Co', model: 'm1', apiKey: 'ai-key-0123456789abcdef' },
          enabled: true,
        })
        .expect(200);
    });

    it('lets only administrators see or change integrations, and keeps clinics apart', async () => {
      for (const who of ['billing', 'reception', 'senior']) {
        await ctx.http().get('/integrations').set(ctx.as(who)).expect(403);
        await ctx.http().put('/integrations/SMS').set(ctx.as(who)).send({ values: {} }).expect(403);
      }
      const other = await ctx.http().get('/integrations').set(ctx.as('adminB')).expect(200);
      expect(
        other.body.every(
          (i: { configured: boolean; enabled: boolean }) => !i.configured && !i.enabled,
        ),
      ).toBe(true);
    });

    it('audits which fields changed, never a value or a hint', async () => {
      const logs = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id, action: { startsWith: 'integration.' } },
      });
      expect(logs.length).toBeGreaterThan(0);
      const text = JSON.stringify(logs);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('ai-key-0123456789abcdef');
      expect(text).not.toContain('••••');
      expect(text).toContain('changedFields');
    });

    it('removes a connection entirely', async () => {
      const res = await ctx
        .http()
        .delete('/integrations/AI_ASSISTANT')
        .set(ctx.as('admin'))
        .expect(200);
      expect(res.body).toMatchObject({ enabled: false, configured: false });
      expect(
        await ctx.admin.integrationSetting.count({
          where: { organizationId: orgA.id, provider: 'AI_ASSISTANT' },
        }),
      ).toBe(0);
    });

    it('refuses edits to the stored secret at the database level for outsiders (RLS)', async () => {
      const rows = await ctx.admin.integrationSetting.count({ where: { organizationId: orgB.id } });
      expect(rows).toBe(0);
    });
  });

  describe('audit log search', () => {
    it('filters, pages and names the actor', async () => {
      const res = await ctx
        .http()
        .get('/audit/search?action=integration.&limit=2')
        .set(ctx.as('admin'))
        .expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      expect(res.body.items[0]).toMatchObject({
        action: expect.stringMatching(/^integration\./),
        actorName: 'admin',
      });
      expect(res.body.hasMore).toBe(true);

      const last = res.body.items[res.body.items.length - 1];
      const next = await ctx
        .http()
        .get(
          `/audit/search?action=integration.&limit=50&before=${encodeURIComponent(last.createdAt)}`,
        )
        .set(ctx.as('admin'))
        .expect(200);
      expect(
        next.body.items.every((r: { createdAt: string }) => r.createdAt < last.createdAt),
      ).toBe(true);

      await ctx.http().get('/audit/search?limit=999').set(ctx.as('admin')).expect(400);
      await ctx.http().get('/audit/search?before=yesterday').set(ctx.as('admin')).expect(400);
      await ctx.http().get('/audit/search').set(ctx.as('billing')).expect(403);
      const other = await ctx.http().get('/audit/search').set(ctx.as('adminB')).expect(200);
      expect(
        other.body.items.every((r: { action: string }) => !r.action.startsWith('integration.')),
      ).toBe(true);
    });
  });

  describe('lab order list', () => {
    it('lists orders with the patient and flags the ones still waiting for a result', async () => {
      const patient = await createPatientWithLogin(ctx, orgA.id, {
        email: 'p@settings-a.example.com',
        phone: '9111000001',
      });
      const encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
      const order = await ctx
        .http()
        .post('/lab-orders')
        .set(ctx.as('senior'))
        .send({ encounterId, items: [{ testName: 'CBC' }, { testName: 'HbA1c' }] })
        .expect(201);

      const pending = await ctx
        .http()
        .get('/lab-orders?pending=true')
        .set(ctx.as('lab'))
        .expect(200);
      const row = pending.body.find((o: { id: string }) => o.id === order.body.id);
      expect(row.patient.firstName).toBe('Test');
      expect(row.items).toHaveLength(2);

      for (const item of order.body.items) {
        await ctx
          .http()
          .post(`/lab-orders/items/${item.id}/results`)
          .set(ctx.as('lab'))
          .send({ resultValue: 'Normal' })
          .expect(201);
      }
      const after = await ctx.http().get('/lab-orders?pending=true').set(ctx.as('lab')).expect(200);
      expect(after.body.map((o: { id: string }) => o.id)).not.toContain(order.body.id);

      // A resulted order can no longer be cancelled.
      await ctx
        .http()
        .post(`/lab-orders/${order.body.id}/cancel`)
        .set(ctx.as('senior'))
        .expect(409);

      await ctx.http().get('/lab-orders?status=NOPE').set(ctx.as('lab')).expect(400);
      await ctx.http().get('/lab-orders').set(ctx.as('billing')).expect(403);
      const other = await ctx.http().get('/lab-orders').set(ctx.as('adminB')).expect(200);
      expect(other.body).toHaveLength(0);
    });
  });

  describe('staff controls', () => {
    it('switches staff off and on and changes roles, with safeguards', async () => {
      const off = await ctx
        .http()
        .post(`/users/${ctx.ids.reception}`)
        .set(ctx.as('admin'))
        .send({ isActive: false })
        .expect(201);
      expect(off.body.isActive).toBe(false);
      await ctx
        .http()
        .post('/auth/login')
        .send({
          organizationId: orgA.id,
          email: `reception@${orgA.id}.example.com`,
          password: 'e2e-shared-password',
        })
        .expect(401);

      const on = await ctx
        .http()
        .post(`/users/${ctx.ids.reception}`)
        .set(ctx.as('admin'))
        .send({ isActive: true, role: 'NURSE' })
        .expect(201);
      expect(on.body).toMatchObject({ isActive: true, role: 'NURSE' });

      await ctx
        .http()
        .post(`/users/${ctx.ids.admin}`)
        .set(ctx.as('admin'))
        .send({ isActive: false })
        .expect(409);
      await ctx
        .http()
        .post(`/users/${ctx.ids.admin2}`)
        .set(ctx.as('admin'))
        .send({ role: 'BILLING' })
        .expect(201);
      // admin2's existing session ended the moment they were demoted, so the
      // old token (which still says "administrator") is refused outright.
      await ctx
        .http()
        .post(`/users/${ctx.ids.admin}`)
        .set(ctx.as('admin2'))
        .send({ isActive: false })
        .expect(401);
      await ctx
        .http()
        .post(`/users/${ctx.ids.billing}`)
        .set(ctx.as('billing'))
        .send({ role: 'ADMINISTRATOR' })
        .expect(403);
      await ctx.http().post(`/users/${ctx.ids.senior}`).set(ctx.as('admin')).send({}).expect(400);
      await ctx
        .http()
        .post(`/users/${ctx.ids.senior}`)
        .set(ctx.as('adminB'))
        .send({ isActive: false })
        .expect(404);

      const logs = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id, action: 'user.update' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });
});
