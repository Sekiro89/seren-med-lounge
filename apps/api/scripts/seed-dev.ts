/**
 * Dev-only bootstrap seed — creates one Organization and one
 * ADMINISTRATOR user with a known password, so there's someone to log in
 * as. Uses DIRECT_DATABASE_URL (the superuser/owner role) deliberately:
 * this is the one legitimate chicken-and-egg case for RLS — before any
 * user exists, there's no tenant context to create the first one with,
 * and `POST /users` requires being authenticated as an admin already.
 *
 * NOT a production bootstrap flow. A real one (CLI command, first-run
 * wizard, infra-provisioned) is a product decision, not made here — see
 * docs/architecture/open-questions.md.
 *
 * Run: pnpm --filter api exec ts-node -O '{"module":"commonjs"}' scripts/seed-dev.ts
 */
import 'reflect-metadata';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const DEV_PASSWORD = 'dev-password-123';

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });

  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    create: { id: 'seed-org', name: 'SereneMed Dev Clinic' },
    update: {},
  });

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@dev.local' } },
    create: {
      organizationId: org.id,
      email: 'admin@dev.local',
      passwordHash,
      fullName: 'Dev Admin',
      role: StaffRole.ADMINISTRATOR,
    },
    update: { passwordHash },
  });

  console.log('Seeded:');
  console.log(`  organizationId: ${org.id}`);
  console.log(`  email:          ${admin.email}`);
  console.log(`  password:       ${DEV_PASSWORD}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
