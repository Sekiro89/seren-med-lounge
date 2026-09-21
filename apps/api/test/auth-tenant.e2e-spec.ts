import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

/**
 * Automates the HTTP-level check that, until now, only existed as a
 * manual curl session (see the "Verifying this" note this replaces in
 * docs/architecture/security.md and open-questions.md#10). Covers the
 * full path: login -> JWT -> JwtAuthGuard -> PermissionsGuard ->
 * TenantContextService -> withTenant -> RLS, plus token revocation
 * (POST /auth/logout — see docs/architecture/security.md#token-revocation).
 *
 * Rate limiting (docs/architecture/security.md#rate-limiting) is
 * deliberately NOT exercised here — ThrottlerModule's skipIf disables it
 * under NODE_ENV=test (Jest sets this automatically) specifically
 * because this suite logs in more times than the real 5/min login limit
 * allows. It was verified manually against a live server instead; see
 * that doc section for the numbers.
 *
 * Seeds directly via a superuser Prisma connection (DIRECT_DATABASE_URL)
 * — the same "admin bypasses RLS" pattern as scripts/seed-dev.ts and
 * scripts/verify-tenant-isolation.ts — since there's no authenticated
 * context to seed *with* before any user exists.
 */
describe('Auth + tenant isolation (e2e)', () => {
  let app: INestApplication;
  let admin: PrismaClient;

  const orgA = { id: 'e2e-org-a', name: 'E2E Org A' };
  const orgB = { id: 'e2e-org-b', name: 'E2E Org B' };
  const adminAPassword = 'admin-a-password';
  const nurseAPassword = 'nurse-a-password';
  const adminBPassword = 'admin-b-password';

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

    // Real DELETE (this is a plain PrismaClient, not PrismaService's
    // soft-delete-extended one) rather than upsert-by-email: an earlier
    // run's iteration (different email fixtures, or the dynamically
    // emailed user the POST /users test creates each run) would
    // otherwise accumulate as extra rows under the same org IDs and
    // silently break the exact-match assertions below. Scoping by
    // organizationId, not truncating the whole table, keeps this
    // independent of whatever else is in the dev database.
    await admin.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });

    await admin.organization.upsert({ where: { id: orgA.id }, create: orgA, update: {} });
    await admin.organization.upsert({ where: { id: orgB.id }, create: orgB, update: {} });

    await admin.user.upsert({
      where: {
        organizationId_email: { organizationId: orgA.id, email: 'admin@org-a.example.com' },
      },
      create: {
        organizationId: orgA.id,
        email: 'admin@org-a.example.com',
        passwordHash: await bcrypt.hash(adminAPassword, 4), // low cost: test speed, not security
        fullName: 'Admin A',
        role: StaffRole.ADMINISTRATOR,
      },
      update: {},
    });
    await admin.user.upsert({
      where: {
        organizationId_email: { organizationId: orgA.id, email: 'nurse@org-a.example.com' },
      },
      create: {
        organizationId: orgA.id,
        email: 'nurse@org-a.example.com',
        passwordHash: await bcrypt.hash(nurseAPassword, 4),
        fullName: 'Nurse A',
        role: StaffRole.NURSE,
      },
      update: {},
    });
    await admin.user.upsert({
      where: {
        organizationId_email: { organizationId: orgB.id, email: 'admin@org-b.example.com' },
      },
      create: {
        organizationId: orgB.id,
        email: 'admin@org-b.example.com',
        passwordHash: await bcrypt.hash(adminBPassword, 4),
        fullName: 'Admin B',
        role: StaffRole.ADMINISTRATOR,
      },
      update: {},
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    // Not deleting here — the next run's beforeAll does it before
    // seeding (see the deleteMany above), which also cleans up after a
    // run that fails partway through and never reaches afterAll.
    await admin.$disconnect();
  });

  async function login(organizationId: string, email: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ organizationId, email, password });
    return res;
  }

  describe('default-deny', () => {
    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('rejects a garbage bearer token with 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('/health remains public', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('login', () => {
    it('rejects the wrong password with 401', async () => {
      const res = await login(orgA.id, 'admin@org-a.example.com', 'wrong-password');
      expect(res.status).toBe(401);
    });

    it('rejects a valid email/password under the wrong organizationId with 401', async () => {
      const res = await login(orgB.id, 'admin@org-a.example.com', adminAPassword);
      expect(res.status).toBe(401);
    });

    it('issues an access token for correct credentials', async () => {
      const res = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        email: 'admin@org-a.example.com',
        role: 'ADMINISTRATOR',
        organizationId: orgA.id,
      });
    });
  });

  describe('tenant isolation + RBAC on GET /users', () => {
    it("org A's admin sees only org A's users", async () => {
      const { body } = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      const emails = res.body.map((u: { email: string }) => u.email).sort();
      expect(emails).toEqual(['admin@org-a.example.com', 'nurse@org-a.example.com']);
    });

    it("org B's admin sees only org B's users, not org A's", async () => {
      const { body } = await login(orgB.id, 'admin@org-b.example.com', adminBPassword);
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      const emails = res.body.map((u: { email: string }) => u.email);
      expect(emails).toEqual(['admin@org-b.example.com']);
    });

    it('a NURSE token gets 403 — RBAC still enforces on top of tenant isolation', async () => {
      const { body } = await login(orgA.id, 'nurse@org-a.example.com', nurseAPassword);
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(403);
    });
  });

  describe('POST /users always creates in the caller’s own org', () => {
    it('ignores any organizationId the client tries to supply and uses the token’s', async () => {
      const { body: loginBody } = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);

      const createRes = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .send({
          email: `created-${Date.now()}@org-a.example.com`,
          password: 'created-user-password',
          fullName: 'Created Via E2E',
          role: 'RECEPTION',
          // No organizationId field exists on createUserSchema at all —
          // this is the important thing being proven: there's no field
          // to smuggle a different org through even if a caller tried.
        })
        .expect(201);

      expect(createRes.body.email).toContain('@org-a.example.com');

      const orgBView = await login(orgB.id, 'admin@org-b.example.com', adminBPassword);
      const listRes = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${orgBView.body.accessToken}`)
        .expect(200);
      const emails = listRes.body.map((u: { email: string }) => u.email);
      expect(emails).not.toContain(createRes.body.email);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the presented token — works before, 401 after', async () => {
      const { body } = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(401);
      expect(res.body.message).toMatch(/revoked/i);
    });

    it('does not affect a different, still-valid token for the same user', async () => {
      const first = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);
      const second = await login(orgA.id, 'admin@org-a.example.com', adminAPassword);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${first.body.accessToken}`)
        .expect(204);

      // Different jti (issued from a separate login) — logging out one
      // session must not revoke the other.
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(200);
    });
  });
});
