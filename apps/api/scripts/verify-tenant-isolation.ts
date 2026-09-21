/**
 * Manual smoke test for Row-Level Security + the soft-delete extension —
 * NOT part of the automated test suite (jest/test:e2e). Needs a real
 * Postgres reachable via .env's DATABASE_URL/DIRECT_DATABASE_URL, and
 * requires the docker-compose Postgres init script
 * (infrastructure/docker/postgres-init/01-app-role.sql) to have actually
 * run, since that's what creates the non-superuser `serenemed_app` role
 * these checks depend on — see docs/architecture/security.md.
 *
 * Run: pnpm --filter api run verify:tenant-isolation
 *
 * This exists because the earlier version of both features looked
 * correct under lint/typecheck/build but had two real, live bugs that
 * only a real Postgres connection surfaced:
 *   1. RLS did nothing at all, because docker-compose's default
 *      POSTGRES_USER is a cluster superuser, and superusers always
 *      bypass RLS regardless of FORCE ROW LEVEL SECURITY.
 *   2. The soft-delete extension's delete()→update() rewrite silently
 *      ran outside the caller's transaction, so it escaped RLS entirely
 *      once RLS was actually enforcing.
 * Re-run this after touching either mechanism.
 *
 * Below the mechanism checks (patients/auditLog, hand-picked examples)
 * is a generic RLS *coverage* check (`assertRlsCoverage`): it asks
 * Postgres's own catalogs which tables have an `organizationId` column,
 * then asserts every one of them has RLS enabled+forced and at least one
 * policy — instead of trusting that whoever added the next table also
 * remembered to hand-write the RLS SQL in their migration (nothing else
 * in the toolchain checks this; see
 * docs/architecture/domain-modules.md rule 6 and
 * docs/architecture/open-questions.md #8(a)/#13). This check needs no
 * updates when a new table is added — it discovers the table set itself
 * every run.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK:   ${message}`);
  }
}

/**
 * Discovers every table in the `public` schema with an `organizationId`
 * column (via information_schema, not a hardcoded list) and asserts each
 * one has RLS enabled, forced, and at least one policy defined — the
 * exact three things `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY`
 * + `CREATE POLICY` in a migration are responsible for. `Organization`
 * itself is correctly excluded: it has no `organizationId` column since
 * it IS the tenant, not a tenant-scoped table.
 *
 * Runs via `admin` (the superuser/DIRECT_DATABASE_URL role) because it
 * needs to read `pg_class`/`pg_policies`, not app data — has nothing to
 * do with RLS bypass here.
 */
async function assertRlsCoverage(admin: PrismaClient) {
  const tables = await admin.$queryRaw<
    { table_name: string; row_security: boolean; force_row_security: boolean }[]
  >`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS row_security,
      c.relforcerowsecurity AS force_row_security
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'organizationId'
      )
    ORDER BY c.relname
  `;

  assert(
    tables.length > 0,
    'found at least one organizationId-scoped table to check (sanity check on the query itself)',
  );

  const policyRows = await admin.$queryRaw<
    { tablename: string }[]
  >`SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'`;
  const tablesWithPolicies = new Set(policyRows.map((r) => r.tablename));

  for (const table of tables) {
    assert(table.row_security, `${table.table_name}: ROW LEVEL SECURITY is enabled`);
    assert(
      table.force_row_security,
      `${table.table_name}: ROW LEVEL SECURITY is forced (FORCE ROW LEVEL SECURITY — without this, the table's owner role bypasses RLS)`,
    );
    assert(
      tablesWithPolicies.has(table.table_name),
      `${table.table_name}: has at least one RLS policy defined`,
    );
  }

  console.log(
    `  (checked ${tables.length} table(s): ${tables.map((t) => t.table_name).join(', ')})`,
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  // Admin connection (the superuser/owner role, via DIRECT_DATABASE_URL)
  // — stands in for a DBA/maintenance task. Used only to reset state
  // between runs and to inspect physical row state ignoring RLS. Every
  // actual assertion below goes through `prisma` (the app role).
  const admin = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });

  console.log('\n--- RLS coverage: every organizationId-scoped table, not just the ones below ---');
  await assertRlsCoverage(admin);

  await admin.$executeRawUnsafe('TRUNCATE "patients", "clinics", "users", "organizations" CASCADE');

  // Organization has no RLS policy (it IS the tenant, nothing to scope
  // it against), so it's the one table creatable without withTenant.
  const orgA = await prisma.client.organization.create({ data: { name: 'Org A' } });
  const orgB = await prisma.client.organization.create({ data: { name: 'Org B' } });

  // Everything below Organization is RLS-protected — even INSERT is
  // blocked without tenant context, since a plain `USING` policy (no
  // separate WITH CHECK) applies to writes too. So seeding, not just
  // reading, has to go through withTenant — exactly like real app code
  // would.
  const clinicA = await prisma.withTenant(orgA.id, (tx) =>
    tx.clinic.create({ data: { name: 'Clinic A', organizationId: orgA.id } }),
  );

  const patientA = await prisma.withTenant(orgA.id, (tx) =>
    tx.patient.create({
      data: {
        organizationId: orgA.id,
        clinicId: clinicA.id,
        firstName: 'Alice',
        lastName: 'A',
        dateOfBirth: new Date('1990-01-01'),
        phone: '1111111111',
      },
    }),
  );

  const patientB = await prisma.withTenant(orgB.id, (tx) =>
    tx.patient.create({
      data: {
        organizationId: orgB.id,
        firstName: 'Bob',
        lastName: 'B',
        dateOfBirth: new Date('1990-01-01'),
        phone: '2222222222',
      },
    }),
  );

  console.log('\n--- RLS: fail-closed with no tenant context ---');
  const noContextResults = await prisma.client.patient.findMany();
  assert(
    noContextResults.length === 0,
    `querying patients with no app.current_organization_id set returns 0 rows (got ${noContextResults.length})`,
  );

  console.log('\n--- RLS: tenant isolation via withTenant ---');
  const orgAView = await prisma.withTenant(orgA.id, (tx) => tx.patient.findMany());
  assert(
    orgAView.length === 1 && orgAView[0]?.id === patientA.id,
    `withTenant(orgA) sees exactly orgA's patient (got ${orgAView.map((p) => p.firstName).join(',')})`,
  );

  const orgBView = await prisma.withTenant(orgB.id, (tx) => tx.patient.findMany());
  assert(
    orgBView.length === 1 && orgBView[0]?.id === patientB.id,
    `withTenant(orgB) sees exactly orgB's patient (got ${orgBView.map((p) => p.firstName).join(',')})`,
  );

  const crossTenantAttempt = await prisma.withTenant(orgA.id, (tx) =>
    tx.patient.findUnique({ where: { id: patientB.id } }),
  );
  assert(
    crossTenantAttempt === null,
    `RLS blocks findUnique across tenants too, not just findMany (org A asking for org B's patient by ID got: ${
      crossTenantAttempt ? 'A ROW — BAD' : 'null — correctly blocked'
    })`,
  );

  console.log('\n--- Soft delete: .delete() is disabled, not silently rewritten ---');
  let deleteThrew = false;
  try {
    await prisma.withTenant(orgA.id, (tx) => tx.patient.delete({ where: { id: patientA.id } }));
  } catch (err) {
    deleteThrew = true;
    console.log(`  (expected) .delete() threw: ${(err as Error).message.split('\n')[0]}`);
  }
  assert(deleteThrew, '.delete() on a soft-deletable model throws instead of running');

  console.log('\n--- Soft delete: the sanctioned path is a direct .update() ---');
  await prisma.withTenant(orgA.id, (tx) =>
    tx.patient.update({ where: { id: patientA.id }, data: { deletedAt: new Date() } }),
  );

  const rawRowStillExists = await admin.$queryRaw<
    { id: string; deletedAt: Date | null }[]
  >`SELECT id, "deletedAt" FROM patients WHERE id = ${patientA.id}`;
  assert(
    rawRowStillExists.length === 1 && rawRowStillExists[0]?.deletedAt !== null,
    `admin (RLS-bypassing) query shows the row still physically exists with deletedAt set ` +
      `(found ${rawRowStillExists.length} row, deletedAt=${rawRowStillExists[0]?.deletedAt})`,
  );

  const softDeletedHiddenFromFindMany = await prisma.withTenant(orgA.id, (tx) =>
    tx.patient.findMany(),
  );
  assert(
    softDeletedHiddenFromFindMany.length === 0,
    `findMany excludes the soft-deleted patient by default (got ${softDeletedHiddenFromFindMany.length})`,
  );

  const explicitlyIncludingDeleted = await prisma.withTenant(orgA.id, (tx) =>
    tx.patient.findMany({ where: { deletedAt: { not: null } } }),
  );
  assert(
    explicitlyIncludingDeleted.length === 1,
    `an explicit deletedAt filter overrides the default and finds the deleted row (got ${explicitlyIncludingDeleted.length})`,
  );

  console.log('\n--- RLS also covers AuditLog (added after this table already existed) ---');
  const logA = await prisma.withTenant(orgA.id, (tx) =>
    tx.auditLog.create({
      data: {
        organizationId: orgA.id,
        actorType: 'SYSTEM',
        action: 'test',
        entityType: 'Test',
        entityId: '1',
      },
    }),
  );
  await prisma.withTenant(orgB.id, (tx) =>
    tx.auditLog.create({
      data: {
        organizationId: orgB.id,
        actorType: 'SYSTEM',
        action: 'test',
        entityType: 'Test',
        entityId: '2',
      },
    }),
  );

  const orgAAuditView = await prisma.withTenant(orgA.id, (tx) => tx.auditLog.findMany());
  assert(
    orgAAuditView.length === 1 && orgAAuditView[0]?.id === logA.id,
    `withTenant(orgA) sees exactly orgA's audit log entry, not orgB's (got ${orgAAuditView.length})`,
  );

  const noContextAuditResults = await prisma.client.auditLog.findMany();
  assert(
    noContextAuditResults.length === 0,
    `querying audit_logs with no tenant context returns 0 rows too (got ${noContextAuditResults.length})`,
  );

  console.log(
    '\n--- Soft delete: AuditLog is unaffected (no deletedAt, real deletes still work) ---',
  );
  // AuditLog has no deletedAt, so it's outside the soft-delete extension's
  // scope entirely — .delete() here is a real DELETE, not the "throws"
  // behavior soft-deletable models get. Still RLS-protected, so still
  // goes through withTenant.
  await prisma.withTenant(orgA.id, (tx) => tx.auditLog.delete({ where: { id: logA.id } }));
  const rawLogGone = await admin.$queryRaw<
    { id: string }[]
  >`SELECT id FROM audit_logs WHERE id = ${logA.id}`;
  assert(
    rawLogGone.length === 0,
    'AuditLog.delete() is a real DELETE, not soft-deleted (row is actually gone)',
  );

  await admin.$disconnect();
  await prisma.onModuleDestroy();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
