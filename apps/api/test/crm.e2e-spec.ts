import { PrismaClient, StaffRole } from '@prisma/client';
import { clinicDateString, clinicDayRange } from '../src/common/clinic-time';
import { setupContext, type TestContext } from './helpers';

/**
 * Marketing funnel & CRM: campaigns (incl. health camps) with their lead
 * funnel, leads with consent-gated outreach, status moves, and conversion
 * into exactly one patient through PatientsService.register.
 */
describe('Marketing funnel & CRM (e2e)', () => {
  let ctx: TestContext;
  let appRole: PrismaClient;
  const orgA = { id: 'e2e-crm-org-a', name: 'E2E CRM Org A' };
  const orgB = { id: 'e2e-crm-org-b', name: 'E2E CRM Org B' };
  let campId: string;
  let digitalId: string;
  let phoneSeq = 0;
  const nextPhone = () => `95550${String(++phoneSeq).padStart(5, '0')}`;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'marketing', organizationId: orgA.id, role: StaffRole.MARKETING },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'inactive', organizationId: orgA.id, role: StaffRole.MARKETING },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    await ctx.admin.user.update({ where: { id: ctx.ids.inactive }, data: { isActive: false } });
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await appRole.$disconnect();
    await ctx.close();
  });

  async function createLead(body: Record<string, unknown> = {}, who = 'marketing') {
    const res = await ctx
      .http()
      .post('/leads')
      .set(ctx.as(who))
      .send({
        firstName: 'Asha',
        lastName: 'Rao',
        phone: nextPhone(),
        source: 'WEBSITE',
        consentToContact: true,
        ...body,
      })
      .expect(201);
    return res.body;
  }

  describe('campaigns', () => {
    it('creates a health camp (needs location + startsAt) and a digital campaign', async () => {
      await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('marketing'))
        .send({ name: 'Diabetes camp', type: 'HEALTH_CAMP' })
        .expect(400);
      await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('marketing'))
        .send({
          name: 'Bad dates',
          type: 'EVENT',
          startsAt: '2030-01-02T00:00:00.000Z',
          endsAt: '2030-01-01T00:00:00.000Z',
        })
        .expect(400);

      const camp = await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('marketing'))
        .send({
          name: 'Diabetes camp',
          type: 'HEALTH_CAMP',
          location: 'Community hall, Jayanagar',
          startsAt: '2030-01-05T03:30:00.000Z',
          budgetMinor: 5000000,
        })
        .expect(201);
      expect(camp.body.status).toBe('PLANNED');
      campId = camp.body.id;

      const digital = await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('admin'))
        .send({ name: 'Instagram weight-loss', type: 'DIGITAL', channel: 'instagram' })
        .expect(201);
      digitalId = digital.body.id;

      const camps = await ctx
        .http()
        .get('/campaigns?type=HEALTH_CAMP')
        .set(ctx.as('marketing'))
        .expect(200);
      expect(camps.body.map((c: { id: string }) => c.id)).toEqual([campId]);
      await ctx.http().get('/campaigns?status=NOPE').set(ctx.as('marketing')).expect(400);
    });

    it('enforces campaign status transitions', async () => {
      const c = await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('marketing'))
        .send({ name: 'Walkathon', type: 'EVENT' })
        .expect(201);
      const status = (s: string) =>
        ctx
          .http()
          .post(`/campaigns/${c.body.id}/status`)
          .set(ctx.as('marketing'))
          .send({ status: s });

      await status('COMPLETED').expect(409); // PLANNED -> COMPLETED skips ACTIVE
      await status('PLANNED').expect(400);
      expect((await status('ACTIVE').expect(201)).body.status).toBe('ACTIVE');
      expect((await status('COMPLETED').expect(201)).body.status).toBe('COMPLETED');
      await status('CANCELLED').expect(409);

      const other = await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('marketing'))
        .send({ name: 'Cancelled one', type: 'OTHER' })
        .expect(201);
      await ctx
        .http()
        .post(`/campaigns/${other.body.id}/status`)
        .set(ctx.as('marketing'))
        .send({ status: 'CANCELLED' })
        .expect(201);
      await ctx
        .http()
        .post(`/campaigns/${other.body.id}/status`)
        .set(ctx.as('marketing'))
        .send({ status: 'ACTIVE' })
        .expect(409);
    });

    it('is campaign:manage only', async () => {
      await ctx.http().get('/campaigns').set(ctx.as('reception')).expect(403);
      await ctx
        .http()
        .post('/campaigns')
        .set(ctx.as('reception'))
        .send({ name: 'x', type: 'OTHER' })
        .expect(403);
    });
  });

  describe('leads', () => {
    it('validates source/campaign, referrer and owner', async () => {
      const base = { firstName: 'X', phone: nextPhone(), consentToContact: false };
      const post = (body: object) =>
        ctx
          .http()
          .post('/leads')
          .set(ctx.as('marketing'))
          .send({ ...base, ...body });

      await post({ source: 'CAMPAIGN' }).expect(400); // campaignId required
      await post({ source: 'CAMP', campaignId: digitalId }).expect(400); // CAMP needs a HEALTH_CAMP
      await post({ source: 'WEBSITE', referredByPatientId: 'x' }).expect(400);
      await post({ source: 'REFERRAL', referredByPatientId: 'nope' }).expect(400);
      await post({ source: 'WEBSITE', ownerId: ctx.ids.inactive }).expect(400);
      await post({ source: 'WEBSITE', ownerId: ctx.ids.adminB }).expect(400);
      await ctx
        .http()
        .post('/leads')
        .set(ctx.as('marketing'))
        .send({ firstName: 'X', phone: nextPhone(), source: 'WEBSITE' })
        .expect(400); // consentToContact is required

      const referrer = await ctx.admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Ref',
          lastName: 'Errer',
          dateOfBirth: new Date('1970-01-01'),
          phone: nextPhone(),
        },
      });
      const lead = await createLead({
        source: 'REFERRAL',
        referredByPatientId: referrer.id,
        ownerId: ctx.ids.marketing,
        consentToContact: false,
      });
      expect(lead.status).toBe('NEW');
      expect(lead.consentRecordedAt).toBeNull();
      expect(lead.possibleDuplicateLeadIds).toEqual([]);
    });

    it('creates a camp lead with consent and warns (without blocking) on duplicate phone', async () => {
      const phone = nextPhone();
      const first = await createLead({
        phone,
        source: 'CAMP',
        campaignId: campId,
        enquiry: 'Sugar levels high, wants a consult',
      });
      expect(first.consentRecordedAt).not.toBeNull();
      expect(first.campaign.id).toBe(campId);

      const second = await createLead({ phone, source: 'WEBSITE' });
      expect(second.possibleDuplicateLeadIds).toEqual([first.id]);

      // A LOST lead no longer counts as an open duplicate.
      await ctx
        .http()
        .post(`/leads/${first.id}/status`)
        .set(ctx.as('marketing'))
        .send({ status: 'LOST', lostReason: 'Went elsewhere' })
        .expect(201);
      await ctx
        .http()
        .post(`/leads/${second.id}/status`)
        .set(ctx.as('marketing'))
        .send({ status: 'LOST', lostReason: 'No answer' })
        .expect(201);
      const third = await createLead({ phone, source: 'WALK_IN' });
      expect(third.possibleDuplicateLeadIds).toEqual([]);
    });

    it('refuses outreach without consent, moves NEW -> CONTACTED on first contact', async () => {
      const noConsent = await createLead({ consentToContact: false });
      for (const type of ['CALL', 'MESSAGE', 'EMAIL', 'EDUCATION_SENT']) {
        await ctx
          .http()
          .post(`/leads/${noConsent.id}/activities`)
          .set(ctx.as('marketing'))
          .send({ type })
          .expect(409);
      }
      // An internal note is fine and doesn't count as contact.
      const note = await ctx
        .http()
        .post(`/leads/${noConsent.id}/activities`)
        .set(ctx.as('marketing'))
        .send({ type: 'NOTE', notes: 'Prefers evenings' })
        .expect(201);
      expect(note.body.lead.status).toBe('NEW');
      await ctx
        .http()
        .post(`/leads/${noConsent.id}/activities`)
        .set(ctx.as('marketing'))
        .send({ type: 'STATUS_CHANGE' })
        .expect(400);

      const lead = await createLead({ ownerId: ctx.ids.marketing });
      const today = clinicDayRange(clinicDateString());
      const dueAt = new Date(today.from.getTime() + 12 * 60 * 60 * 1000).toISOString();
      const call = await ctx
        .http()
        .post(`/leads/${lead.id}/activities`)
        .set(ctx.as('marketing'))
        .send({ type: 'CALL', notes: 'Discussed weight-loss program', nextFollowUpAt: dueAt })
        .expect(201);
      expect(call.body.lead.status).toBe('CONTACTED');

      const detail = await ctx.http().get(`/leads/${lead.id}`).set(ctx.as('marketing')).expect(200);
      expect(detail.body.activities.map((a: { type: string }) => a.type)).toEqual([
        'CALL',
        'STATUS_CHANGE',
      ]);

      // A second contact doesn't write another STATUS_CHANGE.
      await ctx
        .http()
        .post(`/leads/${lead.id}/activities`)
        .set(ctx.as('marketing'))
        .send({ type: 'EDUCATION_SENT' })
        .expect(201);
      const after = await ctx.http().get(`/leads/${lead.id}`).set(ctx.as('marketing')).expect(200);
      expect(
        after.body.activities.filter((a: { type: string }) => a.type === 'STATUS_CHANGE'),
      ).toHaveLength(1);

      const due = await ctx
        .http()
        .get('/leads?due=today&mine=true')
        .set(ctx.as('marketing'))
        .expect(200);
      expect(due.body.map((l: { id: string }) => l.id)).toEqual([lead.id]);
      const adminMine = await ctx.http().get('/leads?mine=true').set(ctx.as('admin')).expect(200);
      expect(adminMine.body).toEqual([]);
      await ctx.http().get('/leads?due=tomorrow').set(ctx.as('marketing')).expect(400);
    });

    it('requires a reason for LOST, never allows CONVERTED via status, re-opens LOST', async () => {
      const lead = await createLead();
      const status = (body: object) =>
        ctx.http().post(`/leads/${lead.id}/status`).set(ctx.as('marketing')).send(body);

      await status({ status: 'LOST' }).expect(400);
      await status({ status: 'CONVERTED' }).expect(400);
      expect((await status({ status: 'NURTURING' }).expect(201)).body.status).toBe('NURTURING');
      await status({ status: 'NURTURING' }).expect(409);
      const lost = await status({ status: 'LOST', lostReason: 'Too expensive' }).expect(201);
      expect(lost.body.lostReason).toBe('Too expensive');
      await status({ status: 'APPOINTMENT_BOOKED' }).expect(409);
      await ctx
        .http()
        .post(`/leads/${lead.id}/activities`)
        .set(ctx.as('marketing'))
        .send({ type: 'NOTE' })
        .expect(409);
      const reopened = await status({ status: 'NURTURING' }).expect(201);
      expect(reopened.body.lostReason).toBeNull();

      const filtered = await ctx
        .http()
        .get('/leads?status=NURTURING&source=WEBSITE')
        .set(ctx.as('reception'))
        .expect(200);
      expect(filtered.body.map((l: { id: string }) => l.id)).toContain(lead.id);
    });

    it('lets RECEPTION read but not write, and refuses roles without lead:read', async () => {
      const lead = await createLead();
      await ctx.http().get('/leads').set(ctx.as('reception')).expect(200);
      await ctx.http().get(`/leads/${lead.id}`).set(ctx.as('reception')).expect(200);
      await ctx
        .http()
        .post('/leads')
        .set(ctx.as('reception'))
        .send({ firstName: 'X', phone: nextPhone(), source: 'WALK_IN', consentToContact: true })
        .expect(403);
      await ctx
        .http()
        .post(`/leads/${lead.id}/activities`)
        .set(ctx.as('reception'))
        .send({ type: 'NOTE' })
        .expect(403);
      await ctx
        .http()
        .post(`/leads/${lead.id}/status`)
        .set(ctx.as('reception'))
        .send({ status: 'NURTURING' })
        .expect(403);
      await ctx.http().get('/leads').set(ctx.as('nurse')).expect(403);
    });
  });

  describe('conversion', () => {
    it('is refused for MARKETING (lacks patient:write) and RECEPTION (lacks lead:write)', async () => {
      const lead = await createLead();
      for (const who of ['marketing', 'reception']) {
        await ctx
          .http()
          .post(`/leads/${lead.id}/convert`)
          .set(ctx.as(who))
          .send({ dateOfBirth: '1990-01-01' })
          .expect(403);
      }
    });

    it('links an existing patientId, carries consent over, and refuses a double convert', async () => {
      const patient = await ctx.admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Ravi',
          lastName: 'Kumar',
          dateOfBirth: new Date('1980-02-02'),
          phone: nextPhone(),
        },
      });
      const lead = await createLead({ firstName: 'Ravi', lastName: 'Kumar' });

      await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ patientId: 'missing' })
        .expect(404);
      await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ patientId: patient.id, dateOfBirth: '1980-02-02' })
        .expect(400);

      const res = await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ patientId: patient.id })
        .expect(201);
      expect(res.body).toMatchObject({ converted: true, via: 'patient_id', patientId: patient.id });
      expect(res.body.lead.status).toBe('CONVERTED');
      expect(res.body.lead.convertedAt).not.toBeNull();

      const consents = await ctx.admin.patientConsent.findMany({
        where: { patientId: patient.id },
      });
      expect(consents).toHaveLength(1);
      expect(consents[0]).toMatchObject({
        consentType: 'MARKETING_COMMUNICATION',
        action: 'GRANTED',
        recordedById: ctx.ids.admin,
      });

      // Same lead again (same patient) is an idempotent success; another patient is 409.
      await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ patientId: patient.id })
        .expect(201);
      await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ dateOfBirth: '1980-02-02' })
        .expect(409);
      await ctx
        .http()
        .post(`/leads/${lead.id}/status`)
        .set(ctx.as('admin'))
        .send({ status: 'NURTURING' })
        .expect(409);

      // A second lead can't claim the same patient.
      const other = await createLead();
      await ctx
        .http()
        .post(`/leads/${other.id}/convert`)
        .set(ctx.as('admin'))
        .send({ patientId: patient.id })
        .expect(409);
    });

    it('registers a new patient (created) and does not create consent without lead consent', async () => {
      const lead = await createLead({
        firstName: 'Meera',
        lastName: 'Iyer',
        email: 'meera@crm.example.com',
        consentToContact: false,
      });
      const res = await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ dateOfBirth: '1992-03-03' })
        .expect(201);
      expect(res.body).toMatchObject({ converted: true, via: 'created' });
      const patient = await ctx.admin.patient.findUniqueOrThrow({
        where: { id: res.body.patientId },
      });
      expect(patient).toMatchObject({
        firstName: 'Meera',
        lastName: 'Iyer',
        phone: lead.phone,
        email: 'meera@crm.example.com',
        organizationId: orgA.id,
      });
      expect(await ctx.admin.patientConsent.count({ where: { patientId: patient.id } })).toBe(0);
    });

    it('needs a lastName to register', async () => {
      const lead = await createLead({ lastName: undefined });
      await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ dateOfBirth: '1992-03-03' })
        .expect(400);
    });

    it('links to an existing patient on phone+DOB+lastName match instead of duplicating', async () => {
      const phone = nextPhone();
      const existing = await ctx.admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Kiran',
          lastName: 'Shetty',
          dateOfBirth: new Date('1975-04-04'),
          phone,
        },
      });
      const lead = await createLead({ firstName: 'Kiran', lastName: 'Shetty', phone });
      const res = await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ dateOfBirth: '1975-04-04' })
        .expect(201);
      expect(res.body).toMatchObject({ converted: true, via: 'existing', patientId: existing.id });
      expect(await ctx.admin.patient.count({ where: { organizationId: orgA.id, phone } })).toBe(1);
    });

    it('does not convert on an ambiguous match — returns the claim for review', async () => {
      const phone = nextPhone();
      await ctx.admin.patient.create({
        data: {
          organizationId: orgA.id,
          firstName: 'Deepa',
          lastName: 'Nair',
          dateOfBirth: new Date('1988-05-05'),
          phone,
        },
      });
      const lead = await createLead({ firstName: 'Deepa', lastName: 'Menon', phone });
      const res = await ctx
        .http()
        .post(`/leads/${lead.id}/convert`)
        .set(ctx.as('admin'))
        .send({ dateOfBirth: '1988-05-05' })
        .expect(201);
      expect(res.body.converted).toBe(false);
      expect(res.body.registration.kind).toBe('ambiguous_match');
      expect(res.body.registration.claimRequestId).toEqual(expect.any(String));
      const after = await ctx.http().get(`/leads/${lead.id}`).set(ctx.as('admin')).expect(200);
      expect(after.body.status).toBe('NEW');
      expect(after.body.convertedPatientId).toBeNull();
    });
  });

  describe('funnel, isolation, audit and DB guarantees', () => {
    it('reports lead counts by status on the campaign', async () => {
      const a = await createLead({ source: 'CAMP', campaignId: campId });
      await createLead({ source: 'CAMPAIGN', campaignId: campId });
      await ctx
        .http()
        .post(`/leads/${a.id}/status`)
        .set(ctx.as('marketing'))
        .send({ status: 'APPOINTMENT_BOOKED' })
        .expect(201);
      const res = await ctx.http().get(`/campaigns/${campId}`).set(ctx.as('marketing')).expect(200);
      // One LOST camp lead from the duplicate test (its WEBSITE/WALK_IN
      // siblings carry no campaign), plus these two.
      expect(res.body.funnel).toEqual({
        NEW: 1,
        CONTACTED: 0,
        NURTURING: 0,
        APPOINTMENT_BOOKED: 1,
        CONVERTED: 0,
        LOST: 1,
      });
      expect(res.body.totalLeads).toBe(3);
    });

    it('hides org A leads and campaigns from org B', async () => {
      const lead = await createLead();
      await ctx.http().get(`/leads/${lead.id}`).set(ctx.as('adminB')).expect(404);
      await ctx.http().get(`/campaigns/${campId}`).set(ctx.as('adminB')).expect(404);
      expect((await ctx.http().get('/leads').set(ctx.as('adminB')).expect(200)).body).toEqual([]);
      expect((await ctx.http().get('/campaigns').set(ctx.as('adminB')).expect(200)).body).toEqual(
        [],
      );
      await ctx
        .http()
        .post(`/leads/${lead.id}/status`)
        .set(ctx.as('adminB'))
        .send({ status: 'NURTURING' })
        .expect(404);
      await ctx
        .http()
        .post(`/campaigns/${campId}/status`)
        .set(ctx.as('adminB'))
        .send({ status: 'ACTIVE' })
        .expect(404);
      // Org B can't attach its lead to org A's campaign.
      await ctx
        .http()
        .post('/leads')
        .set(ctx.as('adminB'))
        .send({
          firstName: 'B',
          phone: nextPhone(),
          source: 'CAMPAIGN',
          campaignId: campId,
          consentToContact: true,
        })
        .expect(400);
    });

    it('audits lead actions without free text', async () => {
      const logs = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id, entityType: { in: ['Lead', 'Campaign'] } },
      });
      const actions = new Set(logs.map((l) => l.action));
      for (const action of [
        'campaign.create',
        'campaign.status',
        'lead.create',
        'lead.activity',
        'lead.status',
        'lead.convert',
        'lead.convert_needs_review',
      ]) {
        expect(actions).toContain(action);
      }
      const dump = JSON.stringify(logs.map((l) => l.metadata));
      for (const text of [
        'Sugar levels',
        'Discussed weight-loss',
        'Prefers evenings',
        'Too expensive',
        'Went elsewhere',
        'Asha',
        'Community hall',
      ]) {
        expect(dump).not.toContain(text);
      }
    });

    it('refuses UPDATE/DELETE on lead_activities for the app role', async () => {
      await expect(
        appRole.$executeRawUnsafe(`UPDATE "lead_activities" SET "notes" = 'x'`),
      ).rejects.toThrow(/permission denied|42501/);
      await expect(appRole.$executeRawUnsafe(`DELETE FROM "lead_activities"`)).rejects.toThrow(
        /permission denied|42501/,
      );
    });
  });
});
