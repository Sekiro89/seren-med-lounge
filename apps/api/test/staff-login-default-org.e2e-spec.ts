import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { wipeOrgs } from './helpers';

/**
 * Staff sign in without a clinic id, like the patient login: the server
 * uses the deployment's DEFAULT_ORGANIZATION_ID, and answers 503 (never a
 * guess) when none is configured. An explicit id still wins.
 */
describe('Staff login without a clinic id (e2e)', () => {
  const org = { id: 'e2e-default-org', name: 'E2E Default Org' };
  const password = 'default-org-password';
  const savedDefault = process.env.DEFAULT_ORGANIZATION_ID;
  let admin: PrismaClient;
  let app: INestApplication | undefined;

  async function boot(defaultOrg: string) {
    // The app reads its config when its module is first imported, so set the
    // value, then import a fresh copy. An empty string counts as "set", so
    // the .env file can't fill it back in.
    process.env.DEFAULT_ORGANIZATION_ID = defaultOrg;
    jest.resetModules();
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
    await wipeOrgs(admin, [org.id]);
    await admin.organization.create({ data: org });
    await admin.user.create({
      data: {
        organizationId: org.id,
        email: 'staff@default-org.example.com',
        passwordHash: await bcrypt.hash(password, 4),
        fullName: 'Default Org Staff',
        role: StaffRole.RECEPTION,
      },
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    if (savedDefault === undefined) delete process.env.DEFAULT_ORGANIZATION_ID;
    else process.env.DEFAULT_ORGANIZATION_ID = savedDefault;
    await wipeOrgs(admin, [org.id]);
    await admin.$disconnect();
  });

  const credentials = { email: 'staff@default-org.example.com', password };

  it('signs in against the deployment default clinic when none is sent', async () => {
    const running = await boot(org.id);
    const res = await request(running.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(201);
    expect(res.body.user.organizationId).toBe(org.id);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('still honours an explicit clinic id', async () => {
    const running = await boot('some-other-org');
    await request(running.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, organizationId: org.id })
      .expect(201);
  });

  it('answers 503 rather than guessing when no default is configured', async () => {
    const running = await boot('');
    await request(running.getHttpServer()).post('/auth/login').send(credentials).expect(503);
  });
});
