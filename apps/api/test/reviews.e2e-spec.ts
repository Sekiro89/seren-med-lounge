import { EncounterStatus, PatientConsentAction, StaffRole } from '@prisma/client';
import {
  checkedInEncounter,
  createPatientWithLogin,
  setupContext,
  type TestContext,
} from './helpers';

/**
 * Consent-gated review requests -> patient submission -> moderation ->
 * published listing (approved AND patient's publishConsent).
 */
describe('Reviews and testimonials (e2e)', () => {
  let ctx: TestContext;
  const orgA = { id: 'e2e-reviews-org-a', name: 'E2E Reviews Org A' };
  const orgB = { id: 'e2e-reviews-org-b', name: 'E2E Reviews Org B' };
  const SECRET_COMMENT = 'Dr. was wonderful about my private condition XYZZY';
  let seq = 0;

  beforeAll(async () => {
    ctx = await setupContext(
      [orgA, orgB],
      [
        { key: 'marketing', organizationId: orgA.id, role: StaffRole.MARKETING },
        { key: 'admin', organizationId: orgA.id, role: StaffRole.ADMINISTRATOR },
        { key: 'reception', organizationId: orgA.id, role: StaffRole.RECEPTION },
        { key: 'senior', organizationId: orgA.id, role: StaffRole.SENIOR_DOCTOR },
        { key: 'adminB', organizationId: orgB.id, role: StaffRole.ADMINISTRATOR },
      ],
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  const staffId = (key: string) => ctx.ids[key] as string;

  async function newPatient() {
    seq += 1;
    return createPatientWithLogin(ctx, orgA.id, {
      email: `patient${seq}@reviews-a.example.com`,
      phone: `95660000${String(seq).padStart(2, '0')}`,
    });
  }

  async function consent(patientId: string, action: PatientConsentAction, at?: Date) {
    await ctx.admin.patientConsent.create({
      data: {
        organizationId: orgA.id,
        patientId,
        consentType: 'MARKETING_COMMUNICATION',
        action,
        recordedById: staffId('reception'),
        createdAt: at,
      },
    });
  }

  async function closedEncounter(patientId: string) {
    const id = await checkedInEncounter(ctx, 'reception', patientId);
    await ctx.admin.encounter.update({ where: { id }, data: { status: EncounterStatus.CLOSED } });
    return id;
  }

  function requestReview(body: object, who = 'marketing') {
    return ctx.http().post('/review-requests').set(ctx.as(who)).send(body);
  }

  /** A consenting patient with two closed consultations and an open request. */
  async function patientWithRequest() {
    const p = await newPatient();
    await consent(p.id, 'GRANTED');
    await closedEncounter(p.id);
    await closedEncounter(p.id);
    const res = await requestReview({ patientId: p.id, stage: 'AFTER_SECOND_CONSULTATION' }).expect(
      201,
    );
    return { patient: p, requestId: res.body.id as string };
  }

  function submit(auth: { Authorization: string }, requestId: string, body: object) {
    return ctx.http().post(`/patients/me/review-requests/${requestId}/review`).set(auth).send(body);
  }

  describe('consent gate and eligibility', () => {
    it('refuses without consent, after revocation, and accepts when the latest row is GRANTED', async () => {
      const p = await newPatient();
      await closedEncounter(p.id);
      await closedEncounter(p.id);
      const body = { patientId: p.id, stage: 'AFTER_SECOND_CONSULTATION' };

      const none = await requestReview(body).expect(409);
      expect(none.body.message).not.toMatch(/consent/i);

      await consent(p.id, 'GRANTED', new Date(Date.now() - 60_000));
      await consent(p.id, 'REVOKED', new Date(Date.now() - 30_000));
      await requestReview(body).expect(409);

      await consent(p.id, 'GRANTED');
      const ok = await requestReview(body).expect(201);
      expect(ok.body.status).toBe('REQUESTED');
      expect(ok.body.dedupeKey).toBe('AFTER_SECOND_CONSULTATION:-');
      const days = (new Date(ok.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);

      // duplicate stage
      await requestReview(body).expect(409);
    });

    it('needs two CLOSED consultations for AFTER_SECOND_CONSULTATION', async () => {
      const p = await newPatient();
      await consent(p.id, 'GRANTED');
      await closedEncounter(p.id);
      await checkedInEncounter(ctx, 'reception', p.id); // open, doesn't count
      await requestReview({ patientId: p.id, stage: 'AFTER_SECOND_CONSULTATION' }).expect(409);
    });

    it('needs a DONE follow-up for AFTER_FIRST_FOLLOW_UP', async () => {
      const p = await newPatient();
      await consent(p.id, 'GRANTED');
      const body = { patientId: p.id, stage: 'AFTER_FIRST_FOLLOW_UP' };
      const followUp = await ctx.admin.followUp.create({
        data: {
          organizationId: orgA.id,
          patientId: p.id,
          type: 'RECOVERY_CHECK',
          dueAt: new Date(),
          createdById: staffId('reception'),
        },
      });
      await requestReview(body).expect(409);
      await ctx.admin.followUp.update({ where: { id: followUp.id }, data: { status: 'DONE' } });
      await requestReview(body).expect(201);
    });

    it('needs a COMPLETED procedure of this patient for AFTER_PROCEDURE, deduped per procedure', async () => {
      const p = await newPatient();
      const other = await newPatient();
      await consent(p.id, 'GRANTED');
      const encounterId = await checkedInEncounter(ctx, 'reception', p.id);
      const otherEncounterId = await checkedInEncounter(ctx, 'reception', other.id);
      const mk = (patientId: string, encId: string, status: 'PLANNED' | 'COMPLETED') =>
        ctx.admin.procedure.create({
          data: {
            organizationId: orgA.id,
            patientId,
            encounterId: encId,
            kind: 'PROCEDURE',
            name: 'Endoscopy',
            status,
            createdById: staffId('admin'),
            ...(status === 'COMPLETED'
              ? {
                  scheduledAt: new Date(),
                  performedById: staffId('senior'),
                  startedAt: new Date(),
                  completedAt: new Date(),
                }
              : {}),
          },
        });
      const planned = await mk(p.id, encounterId, 'PLANNED');
      const done1 = await mk(p.id, encounterId, 'COMPLETED');
      const done2 = await mk(p.id, encounterId, 'COMPLETED');
      const othersDone = await mk(other.id, otherEncounterId, 'COMPLETED');

      await requestReview({ patientId: p.id, stage: 'AFTER_PROCEDURE' }).expect(400);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_SECOND_CONSULTATION',
        procedureId: done1.id,
      }).expect(400);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_PROCEDURE',
        procedureId: planned.id,
      }).expect(409);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_PROCEDURE',
        procedureId: othersDone.id,
      }).expect(409);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_PROCEDURE',
        procedureId: done1.id,
      }).expect(201);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_PROCEDURE',
        procedureId: done1.id,
      }).expect(409);
      await requestReview({
        patientId: p.id,
        stage: 'AFTER_PROCEDURE',
        procedureId: done2.id,
      }).expect(201);
    });

    it('validates input and 404s an unknown patient', async () => {
      await requestReview({ patientId: 'x', stage: 'WHENEVER' }).expect(400);
      await requestReview({ patientId: 'nope', stage: 'AFTER_FIRST_FOLLOW_UP' }).expect(404);
    });
  });

  describe('staff request management', () => {
    it('lists by status/patient and cancels only REQUESTED', async () => {
      const { patient, requestId } = await patientWithRequest();
      const list = await ctx
        .http()
        .get(`/review-requests?status=REQUESTED&patientId=${patient.id}`)
        .set(ctx.as('admin'))
        .expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toEqual([requestId]);
      await ctx.http().get('/review-requests?status=NOPE').set(ctx.as('admin')).expect(400);

      const cancelled = await ctx
        .http()
        .post(`/review-requests/${requestId}/cancel`)
        .set(ctx.as('marketing'))
        .expect(201);
      expect(cancelled.body.status).toBe('CANCELLED');
      await ctx
        .http()
        .post(`/review-requests/${requestId}/cancel`)
        .set(ctx.as('marketing'))
        .expect(409);
      // patient no longer sees it, and can't submit on it
      const mine = await ctx
        .http()
        .get('/patients/me/review-requests')
        .set(patient.auth)
        .expect(200);
      expect(mine.body).toEqual([]);
      await submit(patient.auth, requestId, { rating: 5, publishConsent: true }).expect(409);
    });
  });

  describe('patient submission', () => {
    it('submits once, atomically; double submit is 409; other patients get 404', async () => {
      const { patient, requestId } = await patientWithRequest();
      const intruder = await newPatient();

      const open = await ctx
        .http()
        .get('/patients/me/review-requests')
        .set(patient.auth)
        .expect(200);
      expect(open.body.map((r: { id: string }) => r.id)).toEqual([requestId]);
      const intruderOpen = await ctx
        .http()
        .get('/patients/me/review-requests')
        .set(intruder.auth)
        .expect(200);
      expect(intruderOpen.body).toEqual([]);

      await submit(intruder.auth, requestId, { rating: 1, publishConsent: true }).expect(404);
      await submit(patient.auth, requestId, { rating: 6, publishConsent: true }).expect(400);
      await submit(patient.auth, requestId, {
        rating: 5,
        format: 'VIDEO',
        publishConsent: true,
      }).expect(400);
      await submit(patient.auth, requestId, { rating: 5 }).expect(400);

      const review = await submit(patient.auth, requestId, {
        rating: 5,
        comment: SECRET_COMMENT,
        publishConsent: true,
      }).expect(201);
      expect(review.body.stage).toBe('AFTER_SECOND_CONSULTATION');
      expect(review.body.moderationStatus).toBe('PENDING');

      await submit(patient.auth, requestId, { rating: 4, publishConsent: true }).expect(409);

      const request = await ctx.admin.reviewRequest.findUnique({ where: { id: requestId } });
      expect(request?.status).toBe('SUBMITTED');

      const mine = await ctx.http().get('/patients/me/reviews').set(patient.auth).expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].comment).toBe(SECRET_COMMENT);
      const intruderReviews = await ctx
        .http()
        .get('/patients/me/reviews')
        .set(intruder.auth)
        .expect(200);
      expect(intruderReviews.body).toEqual([]);
    });

    it('accepts a VIDEO review with a storage key', async () => {
      const { patient, requestId } = await patientWithRequest();
      const res = await submit(patient.auth, requestId, {
        rating: 4,
        format: 'VIDEO',
        videoStorageKey: 'reviews/abc.mp4',
        publishConsent: false,
      }).expect(201);
      expect(res.body.format).toBe('VIDEO');
    });

    it('marks an expired request EXPIRED and refuses with 409', async () => {
      const { patient, requestId } = await patientWithRequest();
      await ctx.admin.reviewRequest.update({
        where: { id: requestId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const open = await ctx
        .http()
        .get('/patients/me/review-requests')
        .set(patient.auth)
        .expect(200);
      expect(open.body).toEqual([]);
      await submit(patient.auth, requestId, { rating: 5, publishConsent: true }).expect(409);
      const request = await ctx.admin.reviewRequest.findUnique({ where: { id: requestId } });
      expect(request?.status).toBe('EXPIRED');
      expect(await ctx.admin.review.count({ where: { requestId } })).toBe(0);
    });

    it('keeps staff tokens off patient routes', async () => {
      await ctx.http().get('/patients/me/review-requests').set(ctx.as('marketing')).expect(403);
    });
  });

  describe('moderation and publishing', () => {
    it('approves/rejects only PENDING; published = APPROVED and publishConsent', async () => {
      const a = await patientWithRequest();
      const b = await patientWithRequest();
      const c = await patientWithRequest();
      const ra = await submit(a.patient.auth, a.requestId, {
        rating: 5,
        comment: 'Great',
        publishConsent: true,
      }).expect(201);
      const rb = await submit(b.patient.auth, b.requestId, {
        rating: 4,
        publishConsent: false,
      }).expect(201);
      const rc = await submit(c.patient.auth, c.requestId, {
        rating: 2,
        publishConsent: true,
      }).expect(201);

      const pending = await ctx
        .http()
        .get('/reviews?moderationStatus=PENDING')
        .set(ctx.as('marketing'))
        .expect(200);
      const pendingIds = pending.body.map((r: { id: string }) => r.id);
      expect(pendingIds).toEqual(expect.arrayContaining([ra.body.id, rb.body.id, rc.body.id]));

      const approved = await ctx
        .http()
        .post(`/reviews/${ra.body.id}/approve`)
        .set(ctx.as('marketing'))
        .expect(201);
      expect(approved.body.moderationStatus).toBe('APPROVED');
      expect(approved.body.moderatedById).toBe(ctx.ids.marketing);
      await ctx.http().post(`/reviews/${rb.body.id}/approve`).set(ctx.as('admin')).expect(201);
      await ctx.http().post(`/reviews/${rc.body.id}/reject`).set(ctx.as('admin')).expect(201);
      await ctx.http().post(`/reviews/${rc.body.id}/approve`).set(ctx.as('admin')).expect(409);
      await ctx.http().post(`/reviews/${ra.body.id}/reject`).set(ctx.as('admin')).expect(409);
      await ctx.http().post('/reviews/nope/approve').set(ctx.as('admin')).expect(404);

      const published = await ctx
        .http()
        .get('/reviews/published')
        .set(ctx.as('marketing'))
        .expect(200);
      const publishedIds = published.body.map((r: { id: string }) => r.id);
      expect(publishedIds).toContain(ra.body.id);
      expect(publishedIds).not.toContain(rb.body.id); // no publishConsent
      expect(publishedIds).not.toContain(rc.body.id); // rejected
    });
  });

  describe('access control and isolation', () => {
    it('denies roles without review:manage and patients on staff routes', async () => {
      const { patient } = await patientWithRequest();
      await ctx.http().get('/review-requests').set(ctx.as('reception')).expect(403);
      await requestReview(
        { patientId: patient.id, stage: 'AFTER_FIRST_FOLLOW_UP' },
        'reception',
      ).expect(403);
      await ctx.http().get('/reviews').set(ctx.as('reception')).expect(403);
      await ctx.http().get('/reviews/published').set(patient.auth).expect(403);
    });

    it("hides org A's requests and reviews from org B", async () => {
      const { patient, requestId } = await patientWithRequest();
      const review = await submit(patient.auth, requestId, {
        rating: 5,
        publishConsent: true,
      }).expect(201);
      const reqs = await ctx.http().get('/review-requests').set(ctx.as('adminB')).expect(200);
      expect(reqs.body).toEqual([]);
      const reviews = await ctx.http().get('/reviews').set(ctx.as('adminB')).expect(200);
      expect(reviews.body).toEqual([]);
      await ctx
        .http()
        .post(`/review-requests/${requestId}/cancel`)
        .set(ctx.as('adminB'))
        .expect(404);
      await ctx.http().post(`/reviews/${review.body.id}/approve`).set(ctx.as('adminB')).expect(404);
      await requestReview(
        { patientId: patient.id, stage: 'AFTER_FIRST_FOLLOW_UP' },
        'adminB',
      ).expect(404);
    });
  });

  describe('audit and database guarantees', () => {
    it('audits every write without review text', async () => {
      const logs = await ctx.admin.auditLog.findMany({
        where: { organizationId: orgA.id },
        select: { action: true, actorType: true, metadata: true },
      });
      const actions = new Set(logs.map((l) => l.action));
      [
        'review_request.create',
        'review_request.cancel',
        'review_request.expire',
        'review.submit',
        'review.moderate',
      ].forEach((a) => expect(actions.has(a)).toBe(true));
      expect(
        logs.filter((l) => l.action === 'review.submit').every((l) => l.actorType === 'PATIENT'),
      ).toBe(true);
      expect(JSON.stringify(logs)).not.toContain('XYZZY');
    });

    it('enforces the rating and video CHECK constraint', async () => {
      const { patient, requestId } = await patientWithRequest();
      await expect(
        ctx.admin.review.create({
          data: {
            organizationId: orgA.id,
            patientId: patient.id,
            requestId,
            stage: 'AFTER_SECOND_CONSULTATION',
            rating: 6,
          },
        }),
      ).rejects.toThrow(/reviews_content_check/);
      await expect(
        ctx.admin.review.create({
          data: {
            organizationId: orgA.id,
            patientId: patient.id,
            requestId,
            stage: 'AFTER_SECOND_CONSULTATION',
            rating: 3,
            format: 'VIDEO',
          },
        }),
      ).rejects.toThrow(/reviews_content_check/);
    });
  });
});
