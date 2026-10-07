import { StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Discharge -> care plan -> follow-up worklist (done / missed /
 * escalate / book a review appointment) -> plan completion.
 */
describe('Discharge, care plans and follow-ups (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-care-org-a', name: 'E2E Care Org A' };
  const orgB = { id: 'e2e-care-org-b', name: 'E2E Care Org B' };
  let patient: { id: string; auth: { Authorization: string } };

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@care-a.example.com',
      phone: '9333000001',
    });
  });

  afterAll(() => ctx.close());

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

  describe('discharge', () => {
    it('refuses while a draft note is unsigned, then closes the visit with a care plan', async () => {
      const encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
      const draft = await ctx
        .http()
        .post('/clinical-notes')
        .set(ctx.as('junior'))
        .send({ encounterId, assessment: 'Viral fever' })
        .expect(201);

      const body = {
        carePlan: {
          title: 'Fever recovery',
          dischargeInstructions: 'Fluids, paracetamol SOS',
          followUps: [
            { type: 'RECOVERY_CHECK', dueAt: inDays(2), notes: 'Call to check temperature' },
            { type: 'REVIEW_APPOINTMENT', dueAt: inDays(7) },
          ],
        },
      };
      await ctx
        .http()
        .post(`/encounters/${encounterId}/discharge`)
        .set(ctx.as('junior'))
        .send(body)
        .expect(403);
      await ctx
        .http()
        .post(`/encounters/${encounterId}/discharge`)
        .set(ctx.as('senior'))
        .send(body)
        .expect(409);

      await ctx
        .http()
        .post(`/clinical-notes/${draft.body.id}/sign-off`)
        .set(ctx.as('senior'))
        .expect(201);
      const res = await ctx
        .http()
        .post(`/encounters/${encounterId}/discharge`)
        .set(ctx.as('senior'))
        .send(body)
        .expect(201);
      expect(res.body.encounter.status).toBe('CLOSED');
      expect(res.body.carePlan.followUps).toHaveLength(2);

      const appointment = await ctx.admin.appointment.findFirstOrThrow({
        where: { encounter: { id: encounterId } },
      });
      expect(appointment.status).toBe('COMPLETED');

      await ctx
        .http()
        .post(`/encounters/${encounterId}/discharge`)
        .set(ctx.as('senior'))
        .send({})
        .expect(409);

      const detail = await ctx
        .http()
        .get(`/encounters/${encounterId}`)
        .set(ctx.as('senior'))
        .expect(200);
      expect(detail.body.carePlans[0].title).toBe('Fever recovery');
    });
  });

  describe('follow-ups', () => {
    let planId: string;

    beforeAll(async () => {
      const plan = await ctx
        .http()
        .post('/care-plans')
        .set(ctx.as('nurse'))
        .send({ patientId: patient.id, title: 'Post-op care' })
        .expect(201);
      planId = plan.body.id;
    });

    it('builds today/overdue worklists of open items', async () => {
      const today = await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('nurse'))
        .send({
          patientId: patient.id,
          carePlanId: planId,
          type: 'MEDICATION_REMINDER',
          dueAt: new Date().toISOString(),
        })
        .expect(201);
      const overdue = await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('nurse'))
        .send({
          patientId: patient.id,
          carePlanId: planId,
          type: 'RECOVERY_CHECK',
          dueAt: inDays(-3),
          assignedToId: ctx.ids.nurse,
        })
        .expect(201);

      const todayList = await ctx
        .http()
        .get('/follow-ups?view=today')
        .set(ctx.as('nurse'))
        .expect(200);
      expect(todayList.body.map((f: { id: string }) => f.id)).toContain(today.body.id);
      const overdueList = await ctx
        .http()
        .get('/follow-ups?view=overdue&mine=true')
        .set(ctx.as('nurse'))
        .expect(200);
      expect(overdueList.body.map((f: { id: string }) => f.id)).toEqual([overdue.body.id]);

      await ctx
        .http()
        .post(`/follow-ups/${overdue.body.id}/missed`)
        .set(ctx.as('nurse'))
        .send({})
        .expect(201);
      await ctx
        .http()
        .post(`/follow-ups/${overdue.body.id}/done`)
        .set(ctx.as('nurse'))
        .send({})
        .expect(409);
      await ctx
        .http()
        .post(`/follow-ups/${today.body.id}/done`)
        .set(ctx.as('nurse'))
        .send({ outcome: 'Taking meds' })
        .expect(201);

      const after = await ctx
        .http()
        .get('/follow-ups?view=overdue&mine=true')
        .set(ctx.as('nurse'))
        .expect(200);
      expect(after.body).toHaveLength(0);
    });

    it('escalates a follow-up to a doctor', async () => {
      const followUp = await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('nurse'))
        .send({
          patientId: patient.id,
          carePlanId: planId,
          type: 'RECOVERY_CHECK',
          dueAt: inDays(0),
        })
        .expect(201);
      const escalated = await ctx
        .http()
        .post(`/follow-ups/${followUp.body.id}/escalate`)
        .set(ctx.as('nurse'))
        .send({ outcome: 'Wound discharge reported', assignedToId: ctx.ids.senior })
        .expect(201);
      expect(escalated.body.status).toBe('ESCALATED');

      // Plan can't complete while it's open.
      await ctx.http().post(`/care-plans/${planId}/complete`).set(ctx.as('nurse')).expect(409);
      await ctx
        .http()
        .post(`/follow-ups/${followUp.body.id}/done`)
        .set(ctx.as('senior'))
        .send({ outcome: 'Dressing changed' })
        .expect(201);
    });

    it('books a review appointment from a REVIEW_APPOINTMENT follow-up, once', async () => {
      const review = await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('junior'))
        .send({
          patientId: patient.id,
          carePlanId: planId,
          type: 'REVIEW_APPOINTMENT',
          dueAt: inDays(5),
        })
        .expect(201);
      const booked = await ctx
        .http()
        .post(`/follow-ups/${review.body.id}/book`)
        .set(ctx.as('junior'))
        .send({ scheduledAt: inDays(5), doctorId: ctx.ids.senior })
        .expect(201);
      expect(booked.body.appointment.doctorId).toBe(ctx.ids.senior);
      await ctx
        .http()
        .post(`/follow-ups/${review.body.id}/book`)
        .set(ctx.as('junior'))
        .send({ scheduledAt: inDays(6) })
        .expect(409);

      const reminder = await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('junior'))
        .send({ patientId: patient.id, type: 'MEDICATION_REMINDER', dueAt: inDays(1) })
        .expect(201);
      await ctx
        .http()
        .post(`/follow-ups/${reminder.body.id}/book`)
        .set(ctx.as('junior'))
        .send({ scheduledAt: inDays(1) })
        .expect(400);
    });

    it('cancelling a plan cancels its open follow-ups; patients see their plans', async () => {
      const plan = await ctx
        .http()
        .post('/care-plans')
        .set(ctx.as('nurse'))
        .send({
          patientId: patient.id,
          title: 'Physio',
          followUps: [{ type: 'RECOVERY_CHECK', dueAt: inDays(3) }],
        })
        .expect(201);
      await ctx.http().post(`/care-plans/${plan.body.id}/cancel`).set(ctx.as('nurse')).expect(201);
      const followUp = await ctx.admin.followUp.findFirstOrThrow({
        where: { carePlanId: plan.body.id },
      });
      expect(followUp.status).toBe('CANCELLED');

      const mine = await ctx.http().get('/patients/me/care-plans').set(patient.auth).expect(200);
      const titles = mine.body.map((p: { title: string }) => p.title);
      expect(titles).toContain('Fever recovery');
      expect(titles).not.toContain('Physio');
      expect(JSON.stringify(mine.body)).not.toContain('outcome');
    });

    it('enforces permissions and tenant isolation', async () => {
      await ctx
        .http()
        .post('/follow-ups')
        .set(ctx.as('reception'))
        .send({ patientId: patient.id, type: 'OTHER', dueAt: inDays(1) })
        .expect(403);
      await ctx
        .http()
        .post('/care-plans')
        .set(ctx.as('adminB'))
        .send({ patientId: patient.id, title: 'x' })
        .expect(404);
      const list = await ctx.http().get('/follow-ups?view=today').set(ctx.as('adminB')).expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('audits without outcome text', async () => {
      const logs = await ctx.admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const actions = new Set(logs.map((l) => l.action));
      [
        'encounter.discharge',
        'care_plan.create',
        'care_plan.cancel',
        'follow_up.create',
        'follow_up.escalate',
        'follow_up.book',
        'follow_up.done',
        'follow_up.missed',
      ].forEach((a) => expect(actions.has(a)).toBe(true));
      expect(JSON.stringify(logs)).not.toContain('Wound discharge');
    });
  });
});
