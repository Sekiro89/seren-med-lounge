-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretsEncrypted" TEXT,
    "secretHints" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_organizationId_provider_key" ON "integration_settings"("organizationId", "provider");

-- AddForeignKey
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_provider_check" CHECK (
  "provider" ~ '^[A-Z][A-Z0-9_]{1,40}$'
);

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "integration_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "integration_settings"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
