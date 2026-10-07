import { PrismaClient, StaffRole } from '@prisma/client';
import { createPatientWithLogin, setupContext, type TestContext } from './helpers';

/**
 * Patient <-> clinic team secure messaging: threads, replies both ways,
 * read stamps and unread counts, notifications, assign/close/reopen,
 * own-thread-only access for patients, and the DB-level immutability
 * of message bodies.
 */
describe('Patient messages (e2e)', () => {
  let ctx: TestContext;
  let appRole: PrismaClient;
  const orgA = { id: 'e2e-messages-org-a', name: 'E2E Messages Org A' };
  const orgB = { id: 'e2e-messages-org-b', name: 'E2E Messages Org B' };
  const SUBJECT = 'Question about my zebra-striped rash';
  const BODY_1 = 'The rash on my elbow is spreading, secret-body-one';
  const REPLY_1 = 'Please apply the cream twice daily, secret-reply-one';
  const BODY_2 = 'Thanks, it looks better, secret-body-two';
  let patient: { id: string; auth: { Authorization: string } };
  let other: { id: string; auth: { Authorization: string } };
  let threadId: string;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'nurse', organizationId: orgA.id, role: StaffRole.NURSE },
        { key: 'doctor', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'billing', organizationId: orgA.id, role: StaffRole.BILLING },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
    appRole = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    patient = await createPatientWithLogin(ctx, orgA.id, {
      email: 'patient@messages-a.example.com',
      phone: '9555000001',
    });
    other = await createPatientWithLogin(ctx, orgA.id, {
      email: 'other@messages-a.example.com',
      phone: '9555000002',
      firstName: 'Other',
    });
  });

  afterAll(async () => {
    await appRole.$disconnect();
    await ctx.close();
  });

  const staffThreads = (who: string, query = '') =>
    ctx.http().get(`/message-threads${query}`).set(ctx.as(who));

  describe('conversation', () => {
    it('patient starts a thread; RECEPTION is notified without the body', async () => {
      const res = await ctx
        .http()
        .post('/patients/me/message-threads')
        .set(patient.auth)
        .send({ subject: SUBJECT, body: BODY_1 })
        .expect(201);
      threadId = res.body.id;
      expect(res.body.status).toBe('OPEN');
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0]).toMatchObject({ senderType: 'PATIENT', body: BODY_1 });

      const notes = await ctx.http().get('/notifications').set(ctx.as('reception')).expect(200);
      const note = notes.body.find(
        (n: { entityId: string; type: string }) =>
          n.entityId === threadId && n.type === 'MESSAGE_RECEIVED',
      );
      expect(note).toBeDefined();
      expect(note.recipientRole).toBe('RECEPTION');
      expect(JSON.stringify(note)).not.toContain('secret-body-one');
      expect(JSON.stringify(note)).not.toContain('zebra');
    });

    it('staff list shows patient name and an unread count; opening marks read-by-staff', async () => {
      const list = await staffThreads('reception').expect(200);
      const row = list.body.find((t: { id: string }) => t.id === threadId);
      expect(row.patient).toMatchObject({ id: patient.id, firstName: 'Test' });
      expect(row.unreadCount).toBe(1);
      expect(row.lastMessageAt).toBeDefined();

      const detail = await ctx
        .http()
        .get(`/message-threads/${threadId}`)
        .set(ctx.as('reception'))
        .expect(200);
      expect(detail.body.messages[0].readByStaffAt).not.toBeNull();

      const after = await staffThreads('reception').expect(200);
      expect(after.body.find((t: { id: string }) => t.id === threadId).unreadCount).toBe(0);
    });

    it('staff reply notifies the patient and shows as unread for them until opened', async () => {
      const before = await staffThreads('reception').expect(200);
      const beforeAt = before.body.find((t: { id: string }) => t.id === threadId).lastMessageAt;

      const reply = await ctx
        .http()
        .post(`/message-threads/${threadId}/messages`)
        .set(ctx.as('doctor'))
        .send({ body: REPLY_1 })
        .expect(201);
      expect(reply.body).toMatchObject({ senderType: 'USER', senderUserId: ctx.ids.doctor });

      const after = await staffThreads('reception').expect(200);
      const afterAt = after.body.find((t: { id: string }) => t.id === threadId).lastMessageAt;
      expect(new Date(afterAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeAt).getTime());
      expect(afterAt).toBe(reply.body.createdAt);

      const notes = await ctx
        .http()
        .get('/patients/me/notifications')
        .set(patient.auth)
        .expect(200);
      const note = notes.body.find((n: { entityId: string }) => n.entityId === threadId);
      expect(note).toMatchObject({ type: 'MESSAGE_RECEIVED', recipientPatientId: patient.id });
      expect(JSON.stringify(note)).not.toContain('secret-reply-one');

      const mine = await ctx
        .http()
        .get('/patients/me/message-threads')
        .set(patient.auth)
        .expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0]).toMatchObject({ id: threadId, unreadCount: 1 });

      const detail = await ctx
        .http()
        .get(`/patients/me/message-threads/${threadId}`)
        .set(patient.auth)
        .expect(200);
      expect(detail.body.messages).toHaveLength(2);
      expect(detail.body.messages[1]).toMatchObject({
        body: REPLY_1,
        senderUser: { fullName: 'doctor' },
      });
      expect(detail.body.messages[1].readByPatientAt).not.toBeNull();
      // The patient's own message is not stamped read-by-patient.
      expect(detail.body.messages[0].readByPatientAt).toBeNull();

      const mineAfter = await ctx
        .http()
        .get('/patients/me/message-threads')
        .set(patient.auth)
        .expect(200);
      expect(mineAfter.body[0].unreadCount).toBe(0);
    });

    it('assign routes the next patient message to the assignee, not RECEPTION', async () => {
      await ctx
        .http()
        .post(`/message-threads/${threadId}/assign`)
        .set(ctx.as('reception'))
        .send({ assignedToId: ctx.ids.nurse })
        .expect(201);

      await ctx
        .http()
        .post(`/patients/me/message-threads/${threadId}/messages`)
        .set(patient.auth)
        .send({ body: BODY_2 })
        .expect(201);

      const nurseNotes = await ctx.http().get('/notifications').set(ctx.as('nurse')).expect(200);
      expect(
        nurseNotes.body.filter(
          (n: { entityId: string; recipientUserId: string }) =>
            n.entityId === threadId && n.recipientUserId === ctx.ids.nurse,
        ),
      ).toHaveLength(1);
      const receptionNotes = await ctx
        .http()
        .get('/notifications')
        .set(ctx.as('reception'))
        .expect(200);
      expect(
        receptionNotes.body.filter((n: { entityId: string }) => n.entityId === threadId),
      ).toHaveLength(1);

      const mineAssigned = await staffThreads('nurse', '?assignedToMe=true').expect(200);
      expect(mineAssigned.body.map((t: { id: string }) => t.id)).toEqual([threadId]);
      expect(mineAssigned.body[0].unreadCount).toBe(1);
      const receptionAssigned = await staffThreads('reception', '?assignedToMe=true').expect(200);
      expect(receptionAssigned.body).toHaveLength(0);
    });

    it('rejects assigning to someone without message:manage or unknown', async () => {
      await ctx
        .http()
        .post(`/message-threads/${threadId}/assign`)
        .set(ctx.as('reception'))
        .send({ assignedToId: ctx.ids.billing })
        .expect(400);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/assign`)
        .set(ctx.as('reception'))
        .send({ assignedToId: ctx.ids.adminB })
        .expect(400);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/assign`)
        .set(ctx.as('reception'))
        .send({})
        .expect(400);
    });

    it('closed threads refuse new messages from either side; reopen allows them again', async () => {
      await ctx.http().post(`/message-threads/${threadId}/close`).set(ctx.as('nurse')).expect(201);
      await ctx.http().post(`/message-threads/${threadId}/close`).set(ctx.as('nurse')).expect(409);
      await ctx
        .http()
        .post(`/patients/me/message-threads/${threadId}/messages`)
        .set(patient.auth)
        .send({ body: 'one more thing' })
        .expect(409);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/messages`)
        .set(ctx.as('nurse'))
        .send({ body: 'late reply' })
        .expect(409);

      const closed = await staffThreads('reception', '?status=CLOSED').expect(200);
      expect(closed.body.map((t: { id: string }) => t.id)).toContain(threadId);
      const open = await staffThreads('reception', '?status=OPEN').expect(200);
      expect(open.body.map((t: { id: string }) => t.id)).not.toContain(threadId);

      await ctx.http().post(`/message-threads/${threadId}/reopen`).set(ctx.as('nurse')).expect(201);
      await ctx.http().post(`/message-threads/${threadId}/reopen`).set(ctx.as('nurse')).expect(409);
      await ctx
        .http()
        .post(`/patients/me/message-threads/${threadId}/messages`)
        .set(patient.auth)
        .send({ body: 'after reopen' })
        .expect(201);
    });
  });

  describe('validation and access', () => {
    it('validates bodies and filters', async () => {
      await ctx
        .http()
        .post('/patients/me/message-threads')
        .set(patient.auth)
        .send({ subject: '', body: 'x' })
        .expect(400);
      await ctx
        .http()
        .post('/patients/me/message-threads')
        .set(patient.auth)
        .send({ subject: 'Hi' })
        .expect(400);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/messages`)
        .set(ctx.as('nurse'))
        .send({ body: '   ' })
        .expect(400);
      await staffThreads('reception', '?status=NOPE').expect(400);
    });

    it("a second patient can never see or write to the first patient's thread", async () => {
      await ctx.http().get(`/patients/me/message-threads/${threadId}`).set(other.auth).expect(404);
      await ctx
        .http()
        .post(`/patients/me/message-threads/${threadId}/messages`)
        .set(other.auth)
        .send({ body: 'snooping' })
        .expect(404);
      const list = await ctx.http().get('/patients/me/message-threads').set(other.auth).expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('patients cannot use staff routes and staff cannot use patient routes', async () => {
      await ctx.http().get('/message-threads').set(patient.auth).expect(403);
      await ctx.http().get(`/message-threads/${threadId}`).set(patient.auth).expect(403);
      await ctx.http().get('/patients/me/message-threads').set(ctx.as('reception')).expect(403);
    });

    it('BILLING (no message:manage) gets 403', async () => {
      await staffThreads('billing').expect(403);
      await ctx.http().get(`/message-threads/${threadId}`).set(ctx.as('billing')).expect(403);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/messages`)
        .set(ctx.as('billing'))
        .send({ body: 'hi' })
        .expect(403);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/close`)
        .set(ctx.as('billing'))
        .expect(403);
    });

    it('another organization sees nothing', async () => {
      const list = await staffThreads('adminB').expect(200);
      expect(list.body).toHaveLength(0);
      await ctx.http().get(`/message-threads/${threadId}`).set(ctx.as('adminB')).expect(404);
      await ctx
        .http()
        .post(`/message-threads/${threadId}/messages`)
        .set(ctx.as('adminB'))
        .send({ body: 'cross-org' })
        .expect(404);
      await ctx.http().post(`/message-threads/${threadId}/close`).set(ctx.as('adminB')).expect(404);
    });

    it('audits ids only — never the subject or body', async () => {
      const logs = await ctx.admin.auditLog.findMany({ where: { organizationId: orgA.id } });
      const actions = new Set(logs.map((l) => l.action));
      ['thread.create', 'message.send', 'thread.assign', 'thread.close', 'thread.reopen'].forEach(
        (a) => expect(actions.has(a)).toBe(true),
      );
      const create = logs.find((l) => l.action === 'thread.create');
      expect(create).toMatchObject({ actorType: 'PATIENT', actorId: patient.id });
      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain('secret-');
      expect(serialized).not.toContain('zebra');
      expect(serialized).not.toContain('after reopen');
    });
  });

  describe('database-level guarantees', () => {
    it('the app role cannot change a message body or delete a message', async () => {
      await expect(
        appRole.$executeRawUnsafe(`UPDATE "messages" SET "body" = 'tampered'`),
      ).rejects.toThrow(/permission denied|42501/);
      await expect(appRole.$executeRawUnsafe(`DELETE FROM "messages"`)).rejects.toThrow(
        /permission denied|42501/,
      );
      // The read stamps are the only updatable columns.
      await expect(
        appRole.$executeRawUnsafe(`UPDATE "messages" SET "readByStaffAt" = now() WHERE false`),
      ).resolves.toBe(0);
    });

    it('enforces sender consistency', async () => {
      await expect(
        ctx.admin.message.create({
          data: {
            organizationId: orgA.id,
            threadId,
            senderType: 'PATIENT',
            senderUserId: ctx.ids.nurse,
            body: 'x',
          },
        }),
      ).rejects.toThrow(/messages_sender_check/);
      await expect(
        ctx.admin.message.create({
          data: { organizationId: orgA.id, threadId, senderType: 'USER', body: 'x' },
        }),
      ).rejects.toThrow(/messages_sender_check/);
    });
  });
});
