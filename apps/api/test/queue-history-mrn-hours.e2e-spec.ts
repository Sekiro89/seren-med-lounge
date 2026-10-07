import { PrismaClient, StaffRole } from '@prisma/client';
import { checkedInEncounter, setupContext, type TestContext } from './helpers';
import { ClinicHoursService } from '../src/clinic-hours/clinic-hours.service';
import { clinicDayAndTime } from '../src/common/clinic-time';

/**
 * Queue stage history (queue_events), patient numbers (MRN) and clinic
 * opening hours.
 */
describe('Queue history, patient numbers and clinic hours (e2e)', () => {
  const orgA = { id: 'e2e-qhm-org-a', name: 'E2E QHM Org A' };
  const orgB = { id: 'e2e-qhm-org-b', name: 'E2E QHM Org B' };
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  let phoneSeq = 0;
  async function createPatient(who: string, firstName: string) {
    phoneSeq += 1;
    const res = await ctx
      .http()
      .post('/patients')
      .set(ctx.as(who))
      .send({
        firstName,
        lastName: 'Numbered',
        dateOfBirth: `1970-01-${String(phoneSeq).padStart(2, '0')}`,
        phone: `9555${String(phoneSeq).padStart(2, '0')}4321`,
      })
      .expect(201);
    expect(res.body.kind).toBe('created');
    return res.body.patient as { id: string; mrn: string };
  }

  describe('patient numbers (MRN)', () => {
    let first: { id: string; mrn: string };
    let second: { id: string; mrn: string };

    it('assigns sequential numbers per organization on staff registration', async () => {
      first = await createPatient('reception', 'Alpha');
      second = await createPatient('reception', 'Beta');
      expect(first.mrn).toBe('SM-000001');
      expect(second.mrn).toBe('SM-000002');

      const otherOrg = await createPatient('adminB', 'Gamma');
      expect(otherOrg.mrn).toBe('SM-000001');
    });

    it('assigns one on self signup, shown in GET /patients/me', async () => {
      const signup = await ctx
        .http()
        .post('/auth/patient/signup')
        .send({
          organizationId: orgA.id,
          firstName: 'Self',
          lastName: 'Signup',
          dateOfBirth: '1991-03-03',
          phone: '9870009999',
          email: 'self-signup@qhm.example.com',
          password: 'a-real-password-123',
        })
        .expect(201);
      const me = await ctx
        .http()
        .get('/patients/me')
        .set('Authorization', `Bearer ${signup.body.accessToken}`)
        .expect(200);
      expect(me.body.mrn).toBe('SM-000003');
    });

    it('is unique per organization', async () => {
      await expect(
        ctx.admin.patient.create({
          data: {
            organizationId: orgA.id,
            firstName: 'Dup',
            lastName: 'Mrn',
            dateOfBirth: new Date('1980-01-01'),
            phone: '9870001111',
            mrn: first.mrn,
          },
        }),
      ).rejects.toThrow();
    });

    it('is returned to staff and searchable with ?q=', async () => {
      const detail = await ctx
        .http()
        .get(`/patients/${second.id}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(detail.body.mrn).toBe('SM-000002');

      for (const q of ['SM-000002', 'sm-000002', '000002']) {
        const res = await ctx.http().get('/patients').query({ q }).set(ctx.as('reception'));
        expect(res.status).toBe(200);
        expect(res.body.map((p: { id: string }) => p.id)).toEqual([second.id]);
        expect(res.body[0].mrn).toBe('SM-000002');
      }
    });

    it('was backfilled for every patient that existed before the migration', async () => {
      const [migration] = await ctx.admin.$queryRaw<Array<{ finished_at: Date }>>`
        SELECT finished_at FROM _prisma_migrations
        WHERE migration_name = '20261010000000_queue_events_mrn_clinic_hours'`;
      expect(migration).toBeDefined();
      const missing = await ctx.admin.patient.count({
        where: { createdAt: { lt: migration!.finished_at }, mrn: null },
      });
      expect(missing).toBe(0);
    });
  });

  describe('queue stage history', () => {
    let entryId: string;
    let patientId: string;

    function history(entry: { history: Array<{ station: string; status: string }> }) {
      return entry.history.map((h) => `${h.station}:${h.status}`);
    }

    async function staffEntry() {
      const res = await ctx.http().get('/queue').set(ctx.as('reception')).expect(200);
      return res.body.find((e: { id: string }) => e.id === entryId);
    }

    it('writes an event when the token is issued, and on each transition', async () => {
      patientId = (await createPatient('reception', 'Queued')).id;
      const encounterId = await checkedInEncounter(ctx, 'reception', patientId);
      const reg = await ctx
        .http()
        .post(`/encounters/${encounterId}/registration`)
        .set(ctx.as('reception'))
        .send({
          visitType: 'NEW_CONSULTATION',
          consultationRoute: 'JUNIOR_ASSESSMENT',
          idProofVerified: true,
        })
        .expect(201);
      entryId = reg.body.queueEntry.id;

      let entry = await staffEntry();
      expect(history(entry)).toEqual(['VITALS:WAITING']);
      expect(Object.keys(entry.history[0]).sort()).toEqual(['at', 'station', 'status']);
      expect(entry.patient.mrn).toMatch(/^SM-\d{6}$/);

      await ctx.http().post(`/queue/${entryId}/call`).set(ctx.as('nurse')).expect(201);
      await ctx.http().post(`/queue/${entryId}/start`).set(ctx.as('nurse')).expect(201);
      await ctx
        .http()
        .post(`/queue/${entryId}/move`)
        .set(ctx.as('nurse'))
        .send({ station: 'JUNIOR_DOCTOR' })
        .expect(201);
      await ctx.http().post(`/queue/${entryId}/skip`).set(ctx.as('reception')).expect(201);
      await ctx
        .http()
        .post(`/queue/${entryId}/move`)
        .set(ctx.as('reception'))
        .send({ station: 'BILLING' })
        .expect(201);
      await ctx.http().post(`/queue/${entryId}/call`).set(ctx.as('reception')).expect(201);
      await ctx.http().post(`/queue/${entryId}/complete`).set(ctx.as('reception')).expect(201);

      entry = await staffEntry();
      expect(history(entry)).toEqual([
        'VITALS:WAITING',
        'VITALS:CALLED',
        'VITALS:IN_SERVICE',
        'JUNIOR_DOCTOR:WAITING',
        'JUNIOR_DOCTOR:SKIPPED',
        'BILLING:WAITING',
        'BILLING:CALLED',
        'BILLING:COMPLETED',
      ]);
      const times = entry.history.map((h: { at: string }) => new Date(h.at).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);

      const actors = await ctx.admin.queueEvent.findMany({
        where: { queueEntryId: entryId },
        orderBy: { at: 'asc' },
        select: { actorId: true },
      });
      expect(actors[0]!.actorId).toBe(ctx.ids.reception);
      expect(actors[1]!.actorId).toBe(ctx.ids.nurse);
    });

    it('a refused transition writes nothing', async () => {
      const before = await ctx.admin.queueEvent.count({ where: { queueEntryId: entryId } });
      await ctx.http().post(`/queue/${entryId}/start`).set(ctx.as('reception')).expect(409);
      expect(await ctx.admin.queueEvent.count({ where: { queueEntryId: entryId } })).toBe(before);
    });

    it('is isolated by tenant and append-only for the app role', async () => {
      const otherOrg = await ctx.http().get('/queue').set(ctx.as('adminB')).expect(200);
      expect(otherOrg.body.map((e: { id: string }) => e.id)).not.toContain(entryId);

      const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const countAs = (org: string) =>
          app.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${org}, true)`;
            return tx.queueEvent.count({ where: { queueEntryId: entryId } });
          });
        expect(await countAs(orgB.id)).toBe(0);
        expect(await countAs(orgA.id)).toBe(8);

        await expect(
          app.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgA.id}, true)`;
            await tx.$executeRaw`UPDATE queue_events SET status = 'WAITING' WHERE "queueEntryId" = ${entryId}`;
          }),
        ).rejects.toThrow(/permission denied/);
        await expect(
          app.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgA.id}, true)`;
            await tx.$executeRaw`DELETE FROM queue_events WHERE "queueEntryId" = ${entryId}`;
          }),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await app.$disconnect();
      }
    });
  });

  describe('clinic opening hours', () => {
    const allWeek = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      opensAt: '00:00',
      closesAt: '23:59',
    }));

    it('is closed with null times when no hours are set', async () => {
      const today = await ctx.http().get('/clinic/hours/today').set(ctx.as('nurse')).expect(200);
      expect(today.body).toEqual({ isOpen: false, opensAt: null, closesAt: null });
      const week = await ctx.http().get('/clinic/hours').set(ctx.as('nurse')).expect(200);
      expect(week.body).toHaveLength(7);
      expect(week.body[0]).toEqual({ dayOfWeek: 0, opensAt: null, closesAt: null });
    });

    it('only schedule:manage may set them, and the body is validated', async () => {
      await ctx
        .http()
        .put('/clinic/hours')
        .set(ctx.as('nurse'))
        .send({ days: allWeek })
        .expect(403);
      for (const days of [
        [{ dayOfWeek: 1, opensAt: '20:00', closesAt: '09:00' }],
        [{ dayOfWeek: 7, opensAt: '09:00', closesAt: '20:00' }],
        [{ dayOfWeek: 1, opensAt: '9:00', closesAt: '20:00' }],
        [
          { dayOfWeek: 1, opensAt: '09:00', closesAt: '20:00' },
          { dayOfWeek: 1, opensAt: '10:00', closesAt: '12:00' },
        ],
      ]) {
        await ctx.http().put('/clinic/hours').set(ctx.as('admin')).send({ days }).expect(400);
      }
    });

    it('replaces the week and reports today', async () => {
      const put = await ctx
        .http()
        .put('/clinic/hours')
        .set(ctx.as('reception'))
        .send({ days: allWeek })
        .expect(200);
      expect(put.body).toHaveLength(7);
      expect(put.body[3]).toEqual({ dayOfWeek: 3, opensAt: '00:00', closesAt: '23:59' });

      const today = await ctx.http().get('/clinic/hours/today').set(ctx.as('nurse')).expect(200);
      expect(today.body).toMatchObject({ opensAt: '00:00', closesAt: '23:59' });
      expect(typeof today.body.isOpen).toBe('boolean');

      // Replacing removes days left out.
      const week = await ctx
        .http()
        .put('/clinic/hours')
        .set(ctx.as('admin'))
        .send({ days: [{ dayOfWeek: 3, opensAt: '09:00', closesAt: '20:00' }] })
        .expect(200);
      expect(week.body.filter((d: { opensAt: string | null }) => d.opensAt !== null)).toEqual([
        { dayOfWeek: 3, opensAt: '09:00', closesAt: '20:00' },
      ]);

      // Other organizations are unaffected.
      const other = await ctx.http().get('/clinic/hours').set(ctx.as('adminB')).expect(200);
      expect(other.body.every((d: { opensAt: string | null }) => d.opensAt === null)).toBe(true);
    });

    it('computes open/closed in clinic time (IST)', async () => {
      // Wednesday 2026-10-07, 10:00 IST is 04:30 UTC.
      expect(clinicDayAndTime(new Date('2026-10-07T04:30:00Z'))).toEqual({
        dayOfWeek: 3,
        time: '10:00',
      });
      // 00:30 IST Thursday is still Wednesday in UTC.
      expect(clinicDayAndTime(new Date('2026-10-07T19:00:00Z'))).toEqual({
        dayOfWeek: 4,
        time: '00:30',
      });

      const service = ctx.app.get(ClinicHoursService);
      const at = (iso: string) => service.today(orgA.id, new Date(iso));
      // Wednesday 09:00–20:00 (set above).
      expect(await at('2026-10-07T04:30:00Z')).toEqual({
        isOpen: true,
        opensAt: '09:00',
        closesAt: '20:00',
      });
      expect((await at('2026-10-07T03:29:00Z')).isOpen).toBe(false); // 08:59
      expect((await at('2026-10-07T03:30:00Z')).isOpen).toBe(true); // 09:00
      expect((await at('2026-10-07T14:30:00Z')).isOpen).toBe(false); // 20:00
      // Thursday has no hours.
      expect(await at('2026-10-08T04:30:00Z')).toEqual({
        isOpen: false,
        opensAt: null,
        closesAt: null,
      });
    });

    it('is staff-only', async () => {
      const signup = await ctx
        .http()
        .post('/auth/patient/login')
        .send({
          organizationId: orgA.id,
          email: 'self-signup@qhm.example.com',
          password: 'a-real-password-123',
        })
        .expect(201);
      const auth = { Authorization: `Bearer ${signup.body.accessToken}` };
      await ctx.http().get('/clinic/hours/today').set(auth).expect(403);
      await ctx.http().get('/clinic/hours').set(auth).expect(403);
      await ctx.http().get('/clinic/hours/today').expect(401);
    });
  });
});
