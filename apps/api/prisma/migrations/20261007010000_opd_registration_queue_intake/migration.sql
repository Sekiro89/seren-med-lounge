-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('NEW_CONSULTATION', 'FOLLOW_UP', 'REPORT_REVIEW', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "ConsultationRoute" AS ENUM ('JUNIOR_ASSESSMENT', 'DIRECT_SENIOR');

-- CreateEnum
CREATE TYPE "QueueStation" AS ENUM ('VITALS', 'JUNIOR_DOCTOR', 'SENIOR_DOCTOR', 'BILLING', 'PHARMACY', 'LAB');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MedicalHistoryCategory" AS ENUM ('ALLERGY', 'CONDITION', 'PAST_SURGERY', 'CURRENT_MEDICATION', 'FAMILY_HISTORY', 'SOCIAL_HISTORY');

-- CreateEnum
CREATE TYPE "MedicalHistoryStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ENTERED_IN_ERROR');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "GlucoseContext" AS ENUM ('FASTING', 'RANDOM', 'POST_PRANDIAL');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "doctorId" TEXT;

-- AlterTable
ALTER TABLE "vitals" ADD COLUMN     "heightCm" DOUBLE PRECISION,
ADD COLUMN     "respiratoryRate" INTEGER,
ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "visitType" "VisitType" NOT NULL,
    "consultationRoute" "ConsultationRoute" NOT NULL,
    "idProofDocumentId" TEXT,
    "idProofVerified" BOOLEAN NOT NULL DEFAULT false,
    "cancerScreeningRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clinicId" TEXT,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "queueDate" DATE NOT NULL,
    "tokenNumber" INTEGER NOT NULL,
    "station" "QueueStation" NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "calledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_history_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "MedicalHistoryCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "AllergySeverity",
    "status" "MedicalHistoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metabolic_workups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "glucoseMgDl" DOUBLE PRECISION,
    "glucoseContext" "GlucoseContext",
    "hba1cPercent" DOUBLE PRECISION,
    "totalCholesterolMgDl" DOUBLE PRECISION,
    "ldlMgDl" DOUBLE PRECISION,
    "hdlMgDl" DOUBLE PRECISION,
    "triglyceridesMgDl" DOUBLE PRECISION,
    "bodyFatPercent" DOUBLE PRECISION,
    "muscleMassKg" DOUBLE PRECISION,
    "visceralFatLevel" DOUBLE PRECISION,
    "otherTests" JSONB,
    "recordedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metabolic_workups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_encounterId_key" ON "registrations"("encounterId");

-- CreateIndex
CREATE INDEX "registrations_organizationId_idx" ON "registrations"("organizationId");

-- CreateIndex
CREATE INDEX "registrations_patientId_idx" ON "registrations"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_encounterId_key" ON "queue_entries"("encounterId");

-- CreateIndex
CREATE INDEX "queue_entries_organizationId_queueDate_station_status_idx" ON "queue_entries"("organizationId", "queueDate", "station", "status");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_organizationId_queueDate_tokenNumber_key" ON "queue_entries"("organizationId", "queueDate", "tokenNumber");

-- CreateIndex
CREATE INDEX "medical_history_entries_organizationId_idx" ON "medical_history_entries"("organizationId");

-- CreateIndex
CREATE INDEX "medical_history_entries_patientId_category_idx" ON "medical_history_entries"("patientId", "category");

-- CreateIndex
CREATE INDEX "metabolic_workups_organizationId_deletedAt_idx" ON "metabolic_workups"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "metabolic_workups_encounterId_idx" ON "metabolic_workups"("encounterId");

-- CreateIndex
CREATE INDEX "appointments_doctorId_scheduledAt_idx" ON "appointments"("doctorId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_idProofDocumentId_fkey" FOREIGN KEY ("idProofDocumentId") REFERENCES "patient_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_history_entries" ADD CONSTRAINT "medical_history_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_history_entries" ADD CONSTRAINT "medical_history_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_history_entries" ADD CONSTRAINT "medical_history_entries_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metabolic_workups" ADD CONSTRAINT "metabolic_workups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metabolic_workups" ADD CONSTRAINT "metabolic_workups_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metabolic_workups" ADD CONSTRAINT "metabolic_workups_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metabolic_workups" ADD CONSTRAINT "metabolic_workups_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

-- Plausibility bounds on the new readings (null = not measured).
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_new_readings_check" CHECK (
  ("respiratoryRate" IS NULL OR "respiratoryRate" BETWEEN 1 AND 100)
  AND ("heightCm" IS NULL OR "heightCm" BETWEEN 20 AND 272)
  AND ("weightKg" IS NULL OR "weightKg" BETWEEN 0.5 AND 500)
);
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_token_check" CHECK ("tokenNumber" > 0);

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "registrations"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "queue_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queue_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "queue_entries"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "medical_history_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medical_history_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "medical_history_entries"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "metabolic_workups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metabolic_workups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "metabolic_workups"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
