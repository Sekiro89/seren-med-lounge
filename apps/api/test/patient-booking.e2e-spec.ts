import { StaffRole } from '@prisma/client';
import { createPatientWithLogin, setupContext, type TestContext } from './helpers';

/**
 * Patient online booking (patient-web): doctors with schedules, free
 * slots, booking at the clinic or by video, cancelling, visit records
 * and the video join gate. Ownership-scoped; staff tokens are refused.
 */
describe('Patient online booking (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-booking-a', name: 'E2E Booking A' };
  const orgB = { id: 'e2e-booking-b', name: 'E2E Booking B' };
  let pooja: { id: string; auth: { Authorization: string } };
  let ravi: { id: string; auth: { Authorization: string } };
  let outsider: { id: string; auth: { Authorization: string } };

  // Tomorrow in clinic time, so every slot is comfortably in the future.
  const tomorrow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + 86_400_000));
  const at = (time: string) => new Date(`${tomorrow}T${time}:00.000+05:30`).toISOString();

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'junior', organizationId: orgA.id, role: StaffRole.JUNIOR_DOCTOR },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
      ],
    );
    pooja = await createPatientWithLogin(ctx, orgA.id, {
      email: 'pooja@booking.example.com',
      phone: '9700000001',
    });
    ravi = await createPatientWithLogin(ctx, orgA.id, {
      email: 'ravi@booking.example.com',
      phone: '9700000002',
      firstName: 'Ravi',
    });
    outsider = await createPatientWithLogin(ctx, orgB.id, {
      email: 'outsider@booking.example.com',
      phone: '9700000003',
    });

    // The junior doctor works 09:00 to 12:00 every day in 30-minute slots;
    // the senior doctor has no schedule at all.
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await ctx
        .http()
        .post('/doctor-availability')
        .set(ctx.as('admin'))
        .send({
          doctorId: ctx.ids.junior,
          dayOfWeek,
          startTime: '09:00',
          endTime: '12:00',
          slotMinutes: 30,
        })
        .expect(201);
    }
  });

  afterAll(() => ctx.close());

  it('lists only doctors who have a schedule, and only to patients', async () => {
    const res = await ctx.http().get('/patients/me/booking/doctors').set(pooja.auth).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: ctx.ids.junior, role: 'JUNIOR_DOCTOR' });
    expect(res.body[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await ctx.http().get('/patients/me/booking/doctors').set(ctx.as('reception')).expect(403);
  });

  it('shows free slots inside the booking window only', async () => {
    const slots = await ctx
      .http()
      .get(`/patients/me/booking/doctors/${ctx.ids.junior}/slots?date=${tomorrow}`)
      .set(pooja.auth)
      .expect(200);
    expect(slots.body).toHaveLength(6);
    expect(slots.body[0].start).toBe(at('09:00'));

    await ctx
      .http()
      .get(`/patients/me/booking/doctors/${ctx.ids.junior}/slots?date=2020-01-01`)
      .set(pooja.auth)
      .expect(400);
    await ctx
      .http()
      .get(`/patients/me/booking/doctors/${ctx.ids.junior}/slots?date=${tomorrow}`)
      .set(outsider.auth)
      .expect(404);
  });

  it('books a free slot once, and tells the next patient it was taken', async () => {
    const booked = await ctx
      .http()
      .post('/patients/me/appointments')
      .set(pooja.auth)
      .send({
        doctorId: ctx.ids.junior,
        scheduledAt: at('09:00'),
        mode: 'IN_PERSON',
        reason: 'Knee pain',
      })
      .expect(201);
    expect(booked.body).toMatchObject({
      status: 'CONFIRMED',
      entrySource: 'ONLINE_BOOKING',
      patientId: pooja.id,
      doctor: { fullName: 'junior' },
    });

    await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ravi.auth)
      .send({ doctorId: ctx.ids.junior, scheduledAt: at('09:00'), mode: 'IN_PERSON' })
      .expect(409);

    const slots = await ctx
      .http()
      .get(`/patients/me/booking/doctors/${ctx.ids.junior}/slots?date=${tomorrow}`)
      .set(ravi.auth)
      .expect(200);
    expect(slots.body.map((s: { start: string }) => s.start)).not.toContain(at('09:00'));

    const alerts = await ctx.admin.notification.findMany({
      where: { organizationId: orgA.id, entityId: booked.body.id, recipientRole: 'RECEPTION' },
    });
    expect(alerts).toHaveLength(1);
    const audit = await ctx.admin.auditLog.findFirst({
      where: {
        organizationId: orgA.id,
        action: 'appointment.book_online',
        entityId: booked.body.id,
      },
    });
    expect(audit?.actorType).toBe('PATIENT');
    expect(JSON.stringify(audit?.metadata)).not.toContain('Knee');
  });

  it('refuses times that are not slots, doctors without a schedule, and staff tokens', async () => {
    await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ravi.auth)
      .send({ doctorId: ctx.ids.junior, scheduledAt: at('09:10'), mode: 'IN_PERSON' })
      .expect(400);
    await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ravi.auth)
      .send({ doctorId: ctx.ids.senior, scheduledAt: at('09:00'), mode: 'IN_PERSON' })
      .expect(400);
    await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ctx.as('reception'))
      .send({ doctorId: ctx.ids.junior, scheduledAt: at('10:00'), mode: 'IN_PERSON' })
      .expect(403);
  });

  it('books a video consultation and caps upcoming bookings at three', async () => {
    const video = await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ravi.auth)
      .send({ doctorId: ctx.ids.junior, scheduledAt: at('09:30'), mode: 'VIDEO' })
      .expect(201);
    expect(video.body.entrySource).toBe('VIDEO_CONSULTATION');

    for (const time of ['10:00', '10:30']) {
      await ctx
        .http()
        .post('/patients/me/appointments')
        .set(ravi.auth)
        .send({ doctorId: ctx.ids.junior, scheduledAt: at(time), mode: 'IN_PERSON' })
        .expect(201);
    }
    await ctx
      .http()
      .post('/patients/me/appointments')
      .set(ravi.auth)
      .send({ doctorId: ctx.ids.junior, scheduledAt: at('11:00'), mode: 'IN_PERSON' })
      .expect(409);
  });

  it('cancels a visit, freeing the slot, but not within two hours', async () => {
    const mine = await ctx.http().get('/patients/me/appointments').set(ravi.auth).expect(200);
    const tenThirty = mine.body.find((a: { scheduledAt: string }) => a.scheduledAt === at('10:30'));

    await ctx
      .http()
      .post(`/patients/me/appointments/${tenThirty.id}/cancel`)
      .set(pooja.auth)
      .expect(404);
    const cancelled = await ctx
      .http()
      .post(`/patients/me/appointments/${tenThirty.id}/cancel`)
      .set(ravi.auth)
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    await ctx
      .http()
      .post(`/patients/me/appointments/${tenThirty.id}/cancel`)
      .set(ravi.auth)
      .expect(409);

    const soon = await ctx.admin.appointment.create({
      data: {
        organizationId: orgA.id,
        patientId: pooja.id,
        doctorId: ctx.ids.junior,
        entrySource: 'ONLINE_BOOKING',
        status: 'CONFIRMED',
        scheduledAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await ctx
      .http()
      .post(`/patients/me/appointments/${soon.id}/cancel`)
      .set(pooja.auth)
      .expect(409);
  });

  it('shows a visit only to its patient, without draft records', async () => {
    const mine = await ctx.http().get('/patients/me/appointments').set(pooja.auth).expect(200);
    const visit = await ctx
      .http()
      .get(`/patients/me/appointments/${mine.body[0].id}`)
      .set(pooja.auth)
      .expect(200);
    expect(visit.body.doctor).toEqual({ fullName: 'junior' });
    expect(visit.body).toHaveProperty('encounter');
    await ctx.http().get(`/patients/me/appointments/${mine.body[0].id}`).set(ravi.auth).expect(404);
  });

  it('gates the video room by time and says plainly when video is switched off', async () => {
    const mine = await ctx.http().get('/patients/me/appointments').set(ravi.auth).expect(200);
    const tomorrowVideo = mine.body.find(
      (a: { entrySource: string }) => a.entrySource === 'VIDEO_CONSULTATION',
    );
    await ctx
      .http()
      .get(`/patients/me/appointments/${tomorrowVideo.id}/video`)
      .set(ravi.auth)
      .expect(409);

    const now = await ctx.admin.appointment.create({
      data: {
        organizationId: orgA.id,
        patientId: ravi.id,
        doctorId: ctx.ids.junior,
        entrySource: 'VIDEO_CONSULTATION',
        status: 'CONFIRMED',
        scheduledAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const res = await ctx
      .http()
      .get(`/patients/me/appointments/${now.id}/video`)
      .set(ravi.auth)
      .expect(503);
    expect(res.body.message).toMatch(/not switched on/);
  });
});
