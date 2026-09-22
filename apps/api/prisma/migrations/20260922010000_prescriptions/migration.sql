-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The RLS and REVOKE sections at the bottom are hand-written — Prisma
-- has no support for either.

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescriptions_organizationId_deletedAt_idx" ON "prescriptions"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "prescriptions_encounterId_idx" ON "prescriptions"("encounterId");

-- CreateIndex
CREATE INDEX "prescriptions_patientId_idx" ON "prescriptions"("patientId");

-- CreateIndex
CREATE INDEX "prescription_items_organizationId_idx" ON "prescription_items"("organizationId");

-- CreateIndex
CREATE INDEX "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale). Both tables carry organizationId, so
-- both get the same policy.
-- =============================================================================

ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescription_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "prescriptions"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "prescription_items"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- =============================================================================
-- Prescription content immutability, enforced by the database, not just
-- app discipline — same treatment as clinical_note_versions/
-- diagnosis_versions. Note this REVOKE applies to prescription_items
-- only, NOT prescriptions: the prescriptions row itself stays mutable
-- (status ACTIVE -> CANCELLED is a lifecycle transition, same as
-- Appointment.status/Encounter.status elsewhere in this schema), but
-- once a prescription_items row exists — the actual medication/dosage/
-- frequency content — it can never be changed or removed. A correction
-- means cancelling the prescription and issuing a new one.
-- =============================================================================

REVOKE UPDATE, DELETE ON "prescription_items" FROM serenemed_app;
