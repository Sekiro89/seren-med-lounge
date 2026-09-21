/**
 * Creates the first Organization + ADMINISTRATOR user in an otherwise
 * empty production database — the same legitimate chicken-and-egg case
 * seed-dev.ts exists for (before any user exists, there's no tenant
 * context to create the first one with, and `POST /users` requires
 * being authenticated as an admin already), but for real deployment
 * instead of local dev: no hardcoded org/credentials, real bcrypt cost,
 * and a hard refusal to run against a database that already has an
 * organization in it — this creates exactly one first admin, once, not
 * a general-purpose org-creation tool.
 *
 * What this deliberately does NOT decide: how an operator is meant to
 * invoke this (a CLI they run by hand, a one-off CI/CD "release" step,
 * a first-run setup wizard in some future admin UI). That's a product
 * decision, not one to guess at here — see
 * docs/architecture/open-questions.md. This just does the one thing
 * that decision would need underneath it either way.
 *
 * Run (from a machine with the superuser DIRECT_DATABASE_URL, same
 * trust boundary as `prisma migrate deploy` — see
 * docs/architecture/deployment.md):
 *
 *   BOOTSTRAP_ORG_ID=acme-clinic \
 *   BOOTSTRAP_ORG_NAME="Acme Clinic" \
 *   BOOTSTRAP_ADMIN_EMAIL=admin@acme-clinic.example \
 *   BOOTSTRAP_ADMIN_PASSWORD='<a real generated password>' \
 *   BOOTSTRAP_ADMIN_NAME="Acme Admin" \
 *   DIRECT_DATABASE_URL=<production superuser URL> \
 *   pnpm --filter api exec ts-node -O '{"module":"commonjs"}' scripts/bootstrap-production.ts
 */
import 'reflect-metadata';
import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Matches UsersService's BCRYPT_COST exactly — this script is a
// one-time stand-in for UsersService.create(), not a different code
// path with its own idea of what "correctly hashed" means.
const BCRYPT_COST = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required (see this script's header comment for the full list).`);
  }
  return value;
}

async function main() {
  const orgId = requireEnv('BOOTSTRAP_ORG_ID');
  const orgName = requireEnv('BOOTSTRAP_ORG_NAME');
  const adminEmail = requireEnv('BOOTSTRAP_ADMIN_EMAIL');
  const adminPassword = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const adminName = requireEnv('BOOTSTRAP_ADMIN_NAME');

  if (adminPassword.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is too short for a real production admin account.');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });

  const existingOrgCount = await prisma.organization.count();
  if (existingOrgCount > 0) {
    await prisma.$disconnect();
    throw new Error(
      `Refusing to run: ${existingOrgCount} organization(s) already exist. This script is for ` +
        `bootstrapping an empty database only — create additional organizations/admins through ` +
        `the normal authenticated flow instead.`,
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_COST);

  const [org, admin] = await prisma.$transaction([
    prisma.organization.create({ data: { id: orgId, name: orgName } }),
    prisma.user.create({
      data: {
        organizationId: orgId,
        email: adminEmail,
        passwordHash,
        fullName: adminName,
        role: StaffRole.ADMINISTRATOR,
      },
    }),
  ]);

  console.log('Bootstrapped:');
  console.log(`  organizationId:  ${org.id}`);
  console.log(`  admin email:     ${admin.email}`);
  console.log('  (password was not logged — you already have it, it was your own input)');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
