-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ReferralUrgency" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcedureKind" AS ENUM ('PROCEDURE', 'SURGERY');

-- CreateEnum
CREATE TYPE "ProcedureStatus" AS ENUM ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClinicalNoteType" AS ENUM ('CONSULTATION', 'PROGRESS', 'OPERATIVE', 'DISCHARGE_SUMMARY');

-- AlterEnum
ALTER TYPE "PatientDocumentType" ADD VALUE 'CONSENT_FORM';

-- AlterTable
ALTER TABLE "clinical_notes" ADD COLUMN     "noteType" "ClinicalNoteType" NOT NULL DEFAULT 'CONSULTATION',
ADD COLUMN     "procedureId" TEXT;

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "type" "ReferralType" NOT NULL,
    "toUserId" TEXT,
    "toName" TEXT,
    "toFacility" TEXT,
    "toSpecialty" TEXT,
    "reason" TEXT NOT NULL,
    "urgency" "ReferralUrgency" NOT NULL DEFAULT 'ROUTINE',
    "status" "ReferralStatus" NOT NULL DEFAULT 'OPEN',
    "outcomeNote" TEXT,
    "referredById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "kind" "ProcedureKind" NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "estimateMinor" INTEGER,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "performedById" TEXT,
    "consentDocumentId" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_checklist_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referrals_organizationId_status_idx" ON "referrals"("organizationId", "status");

-- CreateIndex
CREATE INDEX "referrals_patientId_idx" ON "referrals"("patientId");

-- CreateIndex
CREATE INDEX "referrals_toUserId_status_idx" ON "referrals"("toUserId", "status");

-- CreateIndex
CREATE INDEX "procedures_organizationId_status_idx" ON "procedures"("organizationId", "status");

-- CreateIndex
CREATE INDEX "procedures_patientId_idx" ON "procedures"("patientId");

-- CreateIndex
CREATE INDEX "procedures_performedById_scheduledAt_idx" ON "procedures"("performedById", "scheduledAt");

-- CreateIndex
CREATE INDEX "procedure_checklist_items_organizationId_idx" ON "procedure_checklist_items"("organizationId");

-- CreateIndex
CREATE INDEX "procedure_checklist_items_procedureId_idx" ON "procedure_checklist_items"("procedureId");

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_consentDocumentId_fkey" FOREIGN KEY ("consentDocumentId") REFERENCES "patient_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_checklist_items" ADD CONSTRAINT "procedure_checklist_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_checklist_items" ADD CONSTRAINT "procedure_checklist_items_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_checklist_items" ADD CONSTRAINT "procedure_checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_target_check" CHECK (
  ("type" = 'INTERNAL' AND "toUserId" IS NOT NULL)
  OR ("type" = 'EXTERNAL' AND ("toName" IS NOT NULL OR "toFacility" IS NOT NULL))
);
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_estimate_check" CHECK ("estimateMinor" IS NULL OR "estimateMinor" >= 0);
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_scheduled_check" CHECK (
  "status" IN ('PLANNED', 'CANCELLED') OR ("scheduledAt" IS NOT NULL AND "performedById" IS NOT NULL)
);

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "referrals"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "procedures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedures" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "procedures"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "procedure_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procedure_checklist_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "procedure_checklist_items"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
