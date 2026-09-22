-- CreateTable / CreateIndex / AddForeignKey sections below generated via
-- `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The RLS and REVOKE sections at the bottom are hand-written — Prisma
-- has no support for either.

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "status" "ClinicalRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "diagnosisId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ClinicalRecordStatus" NOT NULL,
    "icdCode" TEXT,
    "description" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnosis_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diagnoses_organizationId_deletedAt_idx" ON "diagnoses"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "diagnoses_encounterId_idx" ON "diagnoses"("encounterId");

-- CreateIndex
CREATE INDEX "diagnoses_patientId_idx" ON "diagnoses"("patientId");

-- CreateIndex
CREATE INDEX "diagnosis_versions_organizationId_idx" ON "diagnosis_versions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "diagnosis_versions_diagnosisId_versionNumber_key" ON "diagnosis_versions"("diagnosisId", "versionNumber");

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_versions" ADD CONSTRAINT "diagnosis_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_versions" ADD CONSTRAINT "diagnosis_versions_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_versions" ADD CONSTRAINT "diagnosis_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale). Both tables carry organizationId, so
-- both get the same policy.
-- =============================================================================

ALTER TABLE "diagnoses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diagnoses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "diagnosis_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "diagnosis_versions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "diagnoses"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "diagnosis_versions"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- =============================================================================
-- Clinical record immutability, enforced by the database, not just app
-- discipline — same treatment as clinical_note_versions (see
-- prisma/migrations/20260921090000_clinic_journey_spine/migration.sql
-- for the full rationale). serenemed_app got SELECT/INSERT/UPDATE/DELETE
-- on diagnosis_versions automatically (ALTER DEFAULT PRIVILEGES in
-- infrastructure/docker/postgres-init/01-app-role.sql); this REVOKE
-- narrows it back to SELECT/INSERT only: a new diagnosis version can
-- always be written, an existing one can never be changed or removed.
-- =============================================================================

REVOKE UPDATE, DELETE ON "diagnosis_versions" FROM serenemed_app;
