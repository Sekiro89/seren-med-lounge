import { StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';
import { clinicDateString, clinicDayRange } from '../src/common/clinic-time';

/**
 * Clinic command centre: doctor availability and slots, staff tasks and
 * personal reminders, and the operational alerts (pharmacy / lab /
 * referral) that land in GET /notifications.
 */
describe('Clinic command centre (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-cmdcentre-org-a', name: 'E2E Command Centre Org A' };
  const orgB = { id: 'e2e-cmdcentre-org-b', name: 'E2E Command Centre Org B' };
  let patient: { id: string; auth: { Authorization: string } };

  /** A clinic-local date two weeks out, plus the day after it. */
  const futureDate = clinicDateString(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  const futureDay = new Date(`${futureDate}T00:00:00.000Z`).getUTCDay();
  const nextDate = clinicDateString(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'pharmacy1', organizationId: orgA.id, role: StaffRole.PHARMACY },
        { key: 'pharmacy2', organizationId: orgA.id, role: StaffRole.PHARMACY },
        { key: 'labtech', organizationId: orgA.id, role: StaffRole.LAB_TECHNICIAN },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@cmdcentre-a.example.com',
      phone: '9555000001',
    });
  });

  afterAll(() => ctx.close());

  function availability(who: string, body: Record<string, unknown>) {
    return ctx.http().post('/doctor-availability').set(ctx.as(who)).send(body);
  }

  async function inbox(who: string, unread = true) {
    const res = await ctx
      .http()
      .get(`/notifications${unread ? '?unread=true' : ''}`)
      .set(ctx.as(who))
      .expect(200);
    return res.body as Array<{
      id: string;
      type: string;
      title: string;
      entityType: string;
      entityId: string;
      readAt: string | null;
    }>;
  }

  describe('doctor availability and slots', () => {
    let windowId: string;

    it('lets reception create a window; nurse gets 403; validation 400', async () => {
      const res = await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '09:00',
        endTime: '10:00',
        slotMinutes: 15,
      }).expect(201);
      windowId = res.body.id;
      expect(res.body.isActive).toBe(true);

      await availability('nurse', {
        doctorId: ctx.ids.senior,
        dayOfWeek: (futureDay + 1) % 7,
        startTime: '09:00',
        endTime: '10:00',
      }).expect(403);

      // end before start, bad clock, day out of range, non-doctor
      await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '11:00',
        endTime: '10:00',
      }).expect(400);
      await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '9:00',
        endTime: '10:00',
      }).expect(400);
      await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: 7,
        startTime: '09:00',
        endTime: '10:00',
      }).expect(400);
      await availability('reception', {
        doctorId: ctx.ids.nurse,
        dayOfWeek: futureDay,
        startTime: '12:00',
        endTime: '13:00',
      }).expect(400);

      const audit = await ctx.admin.auditLog.findFirst({
        where: {
          organizationId: orgA.id,
          action: 'doctor_availability.create',
          entityId: windowId,
        },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects an overlapping active window for the same doctor and day (409)', async () => {
      await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '09:45',
        endTime: '11:00',
      }).expect(409);
      // Adjacent is fine; another doctor at the same time is fine.
      await availability('admin', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '10:00',
        endTime: '10:30',
        slotMinutes: 30,
      }).expect(201);
      await availability('admin', {
        doctorId: ctx.ids.junior,
        dayOfWeek: futureDay,
        startTime: '09:00',
        endTime: '10:00',
      }).expect(201);
    });

    it('computes clinic-local slots and marks booked ones unavailable', async () => {
      await ctx
        .http()
        .post('/appointments')
        .set(ctx.as('reception'))
        .send({
          patientId: patient.id,
          doctorId: ctx.ids.senior,
          entrySource: 'RECEPTION_WALK_IN',
          scheduledAt: new Date(`${futureDate}T09:20:00.000+05:30`).toISOString(),
        })
        .expect(201);

      const res = await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=${futureDate}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(res.body).toHaveLength(5); // 4 x 15min + 1 x 30min
      expect(res.body[0]).toEqual({
        start: new Date(`${futureDate}T09:00:00.000+05:30`).toISOString(),
        end: new Date(`${futureDate}T09:15:00.000+05:30`).toISOString(),
        available: true,
      });
      expect(res.body.map((s: { available: boolean }) => s.available)).toEqual([
        true,
        false,
        true,
        true,
        true,
      ]);
      expect(res.body[4].end).toBe(new Date(`${futureDate}T10:30:00.000+05:30`).toISOString());

      // No windows that day → []
      const empty = await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=${nextDate}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(empty.body).toEqual([]);

      await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=tomorrow`)
        .set(ctx.as('reception'))
        .expect(400);
      await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=${futureDate}`)
        .set(ctx.as('nurse'))
        .expect(403);
    });

    it('lists and deactivates windows; deactivated windows stop producing slots', async () => {
      const list = await ctx
        .http()
        .get(`/doctor-availability?doctorId=${ctx.ids.senior}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(list.body).toHaveLength(2);

      await ctx
        .http()
        .post(`/doctor-availability/${windowId}/deactivate`)
        .set(ctx.as('nurse'))
        .expect(403);
      await ctx
        .http()
        .post(`/doctor-availability/${windowId}/deactivate`)
        .set(ctx.as('reception'))
        .expect(201);
      await ctx
        .http()
        .post(`/doctor-availability/${windowId}/deactivate`)
        .set(ctx.as('reception'))
        .expect(409);

      const slots = await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=${futureDate}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(slots.body).toHaveLength(1);

      // The freed time can now be re-created without a 409.
      await availability('reception', {
        doctorId: ctx.ids.senior,
        dayOfWeek: futureDay,
        startTime: '09:00',
        endTime: '09:30',
      }).expect(201);
    });

    it('isolates availability and slots by organization', async () => {
      await ctx
        .http()
        .get(`/doctors/${ctx.ids.senior}/slots?date=${futureDate}`)
        .set(ctx.as('adminB'))
        .expect(404);
      const list = await ctx.http().get('/doctor-availability').set(ctx.as('adminB')).expect(200);
      expect(list.body).toEqual([]);
      await ctx
        .http()
        .post(`/doctor-availability/${windowId}/deactivate`)
        .set(ctx.as('adminB'))
        .expect(404);
      await availability('adminB', {
        doctorId: ctx.ids.senior,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:00',
      }).expect(400);
    });
  });

  describe('tasks', () => {
    let assignedId: string;

    it('assigns a task, notifies the assignee, and audits without free text', async () => {
      const res = await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('reception'))
        .send({
          title: 'Call back about SECRET-TITLE',
          description: 'SECRET-DESCRIPTION',
          assigneeId: ctx.ids.nurse,
          patientId: patient.id,
          priority: 'HIGH',
        })
        .expect(201);
      assignedId = res.body.id;
      expect(res.body).toMatchObject({
        assigneeId: ctx.ids.nurse,
        createdById: ctx.ids.reception,
        status: 'OPEN',
        priority: 'HIGH',
      });

      const notes = await inbox('nurse');
      const note = notes.find((n) => n.entityId === assignedId);
      expect(note).toMatchObject({ type: 'TASK_ASSIGNED', entityType: 'StaffTask' });
      expect(note!.title).not.toContain('SECRET');

      const mine = await ctx.http().get('/tasks').set(ctx.as('nurse')).expect(200);
      expect(mine.body.map((t: { id: string }) => t.id)).toContain(assignedId);
      const created = await ctx
        .http()
        .get('/tasks?createdByMe=true')
        .set(ctx.as('reception'))
        .expect(200);
      expect(created.body.map((t: { id: string }) => t.id)).toContain(assignedId);
      const receptionMine = await ctx.http().get('/tasks').set(ctx.as('reception')).expect(200);
      expect(receptionMine.body.map((t: { id: string }) => t.id)).not.toContain(assignedId);

      // Mark the notification read; it leaves the unread inbox.
      await ctx.http().post(`/notifications/${note!.id}/read`).set(ctx.as('nurse')).expect(201);
      expect((await inbox('nurse')).map((n) => n.id)).not.toContain(note!.id);

      const audits = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id, entityType: 'StaffTask', entityId: assignedId },
      });
      expect(audits.map((a) => a.action)).toEqual(['task.create']);
      expect(JSON.stringify(audits)).not.toContain('SECRET');
    });

    it('only the assignee or creator may change status; transitions enforced', async () => {
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('senior'))
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('nurse'))
        .send({ status: 'BOGUS' })
        .expect(400);
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('nurse'))
        .send({ status: 'IN_PROGRESS' })
        .expect(201);
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('nurse'))
        .send({ status: 'OPEN' })
        .expect(409);
      const done = await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('reception'))
        .send({ status: 'DONE' })
        .expect(201);
      expect(done.body.completedAt).not.toBeNull();
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('nurse'))
        .send({ status: 'CANCELLED' })
        .expect(409);

      const statusAudit = await ctx.admin.auditLog.findFirst({
        where: { organizationId: orgA.id, action: 'task.status', entityId: assignedId },
        orderBy: { createdAt: 'desc' },
      });
      expect(statusAudit!.metadata).toMatchObject({ from: 'IN_PROGRESS', to: 'DONE' });
    });

    it('supports personal reminders (no notification) and due=today / overdue', async () => {
      const before = await ctx.admin.notification.count({ where: { organizationId: orgA.id } });
      const today = await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('senior'))
        // Late today (clinic-local), so it's due today but not yet overdue.
        .send({
          title: 'Review reports',
          dueAt: new Date(clinicDayRange(clinicDateString()).to.getTime() - 60_000).toISOString(),
        })
        .expect(201);
      expect(today.body.assigneeId).toBe(ctx.ids.senior);
      const overdue = await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('senior'))
        .send({
          title: 'Sign discharge',
          dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);
      const undated = await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('senior'))
        .send({ title: 'Someday' })
        .expect(201);
      expect(await ctx.admin.notification.count({ where: { organizationId: orgA.id } })).toBe(
        before,
      );

      const dueToday = await ctx.http().get('/tasks?due=today').set(ctx.as('senior')).expect(200);
      expect(dueToday.body.map((t: { id: string }) => t.id)).toEqual([today.body.id]);
      const dueOverdue = await ctx
        .http()
        .get('/tasks?due=overdue')
        .set(ctx.as('senior'))
        .expect(200);
      expect(dueOverdue.body.map((t: { id: string }) => t.id)).toEqual([overdue.body.id]);

      // Personal reminder ticked off straight from OPEN.
      await ctx
        .http()
        .post(`/tasks/${undated.body.id}/status`)
        .set(ctx.as('senior'))
        .send({ status: 'DONE' })
        .expect(201);
      const open = await ctx.http().get('/tasks?status=OPEN').set(ctx.as('senior')).expect(200);
      expect(open.body.map((t: { id: string }) => t.id)).not.toContain(undated.body.id);

      await ctx.http().get('/tasks?due=someday').set(ctx.as('senior')).expect(400);
      await ctx.http().post('/tasks').set(ctx.as('senior')).send({ title: '' }).expect(400);
    });

    it('rejects patients, inactive/foreign assignees, and isolates by org', async () => {
      await ctx.http().get('/tasks').set(patient.auth).expect(403);
      await ctx.http().post('/tasks').set(patient.auth).send({ title: 'x' }).expect(403);
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(patient.auth)
        .send({ status: 'DONE' })
        .expect(403);

      await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('adminB'))
        .send({ title: 'x', assigneeId: ctx.ids.nurse })
        .expect(400);
      await ctx
        .http()
        .post('/tasks')
        .set(ctx.as('adminB'))
        .send({ title: 'x', patientId: patient.id })
        .expect(404);
      await ctx
        .http()
        .post(`/tasks/${assignedId}/status`)
        .set(ctx.as('adminB'))
        .send({ status: 'CANCELLED' })
        .expect(404);
      const listB = await ctx
        .http()
        .get('/tasks?createdByMe=true')
        .set(ctx.as('adminB'))
        .expect(200);
      expect(listB.body).toEqual([]);
    });
  });

  describe('operational alerts', () => {
    let encounterId: string;

    beforeAll(async () => {
      encounterId = await checkedInEncounter(ctx, 'reception', patient.id);
    });

    it('alerts every PHARMACY user of a new prescription; first read clears it for the role', async () => {
      const rx = await ctx
        .http()
        .post('/prescriptions')
        .set(ctx.as('senior'))
        .send({
          encounterId,
          items: [{ medicationName: 'Metformin', dosage: '500mg', frequency: 'BD' }],
        })
        .expect(201);

      const p1 = (await inbox('pharmacy1')).find((n) => n.entityId === rx.body.id);
      const p2 = (await inbox('pharmacy2')).find((n) => n.entityId === rx.body.id);
      expect(p1).toMatchObject({
        type: 'PHARMACY_PREPARE',
        entityType: 'Prescription',
        title: 'Prescription ready to prepare',
      });
      expect(p2!.id).toBe(p1!.id);
      expect(p1!.title).not.toContain('Metformin');
      // Not addressed to the lab.
      expect((await inbox('labtech')).map((n) => n.id)).not.toContain(p1!.id);

      await ctx.http().post(`/notifications/${p1!.id}/read`).set(ctx.as('pharmacy1')).expect(201);
      expect((await inbox('pharmacy2')).map((n) => n.id)).not.toContain(p1!.id);
      // A user outside the role can't mark it read.
      await ctx.http().post(`/notifications/${p1!.id}/read`).set(ctx.as('labtech')).expect(404);
    });

    it('alerts LAB_TECHNICIAN of a new lab order and the ordering doctor of a result', async () => {
      const order = await ctx
        .http()
        .post('/lab-orders')
        .set(ctx.as('junior'))
        .send({ encounterId, items: [{ testName: 'HbA1c' }] })
        .expect(201);

      const labNote = (await inbox('labtech')).find((n) => n.entityId === order.body.id);
      expect(labNote).toMatchObject({ type: 'LAB_PREPARE', entityType: 'LabOrder' });
      expect(labNote!.title).not.toContain('HbA1c');
      await ctx
        .http()
        .post(`/notifications/${labNote!.id}/read`)
        .set(ctx.as('labtech'))
        .expect(201);
      expect((await inbox('labtech')).map((n) => n.id)).not.toContain(labNote!.id);

      await ctx
        .http()
        .post(`/lab-orders/items/${order.body.items[0].id}/results`)
        .set(ctx.as('labtech'))
        .send({ resultValue: '6.1', unit: '%' })
        .expect(201);
      const ready = (await inbox('junior')).find(
        (n) => n.type === 'LAB_RESULT_READY' && n.entityId === order.body.id,
      );
      expect(ready).toBeDefined();
      expect(ready!.title).not.toContain('HbA1c');
      expect((await inbox('senior')).some((n) => n.type === 'LAB_RESULT_READY')).toBe(false);
    });

    it('alerts the receiving doctor of an internal referral', async () => {
      const ref = await ctx
        .http()
        .post('/referrals')
        .set(ctx.as('junior'))
        .send({ encounterId, type: 'INTERNAL', toUserId: ctx.ids.senior, reason: 'Review' })
        .expect(201);
      const note = (await inbox('senior')).find((n) => n.entityId === ref.body.id);
      expect(note).toMatchObject({ type: 'REFERRAL_RECEIVED', entityType: 'Referral' });
      expect(note!.title).not.toContain('Review');
    });

    it('keeps notifications inside the organization', async () => {
      expect(await inbox('adminB', false)).toEqual([]);
      const any = await ctx.admin.notification.findFirst({ where: { organizationId: orgA.id } });
      await ctx.http().post(`/notifications/${any!.id}/read`).set(ctx.as('adminB')).expect(404);
    });
  });

  describe('database guarantees', () => {
    it('enforces exactly one notification recipient', async () => {
      await expect(
        ctx.admin.notification.create({
          data: {
            organizationId: orgA.id,
            type: 'GENERAL',
            title: 'x',
            recipientUserId: ctx.ids.nurse,
            recipientRole: StaffRole.NURSE,
          },
        }),
      ).rejects.toThrow(/notifications_one_recipient_check/);
      await expect(
        ctx.admin.notification.create({
          data: { organizationId: orgA.id, type: 'GENERAL', title: 'x' },
        }),
      ).rejects.toThrow(/notifications_one_recipient_check/);
    });

    it('rejects a malformed availability window written directly', async () => {
      await expect(
        ctx.admin.doctorAvailability.create({
          data: {
            organizationId: orgA.id,
            doctorId: ctx.ids.senior!,
            dayOfWeek: 1,
            startTime: '10:00',
            endTime: '09:00',
          },
        }),
      ).rejects.toThrow(/doctor_availability_check/);
    });
  });
});
