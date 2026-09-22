-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The RLS and REVOKE sections at the bottom are hand-written — Prisma
-- has no support for either.

-- CreateEnum
CREATE TYPE "PatientDocumentType" AS ENUM ('PHOTO', 'ID_PROOF', 'INSURANCE_CARD', 'PAN_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientConsentType" AS ENUM ('TREATMENT', 'DATA_SHARING', 'AI_CONSULT_RECORDING', 'MARKETING_COMMUNICATION');

-- CreateEnum
CREATE TYPE "PatientConsentAction" AS ENUM ('GRANTED', 'REVOKED');

-- CreateTable
CREATE TABLE "patient_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "documentType" "PatientDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_consents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentType" "PatientConsentType" NOT NULL,
    "action" "PatientConsentAction" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_documents_organizationId_deletedAt_idx" ON "patient_documents"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "patient_documents_patientId_idx" ON "patient_documents"("patientId");

-- CreateIndex
CREATE INDEX "patient_consents_organizationId_idx" ON "patient_consents"("organizationId");

-- CreateIndex
CREATE INDEX "patient_consents_patientId_consentType_idx" ON "patient_consents"("patientId", "consentType");

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale). Both tables carry organizationId, so
-- both get the same policy.
-- =============================================================================

ALTER TABLE "patient_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "patient_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_consents" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "patient_documents"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "patient_consents"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- =============================================================================
-- Consent immutability, enforced by the database, not just app
-- discipline — same treatment as clinical_note_versions/diagnosis_versions/
-- prescription_items/lab_order_items/lab_results. NOT applied to
-- patient_documents, which stays an ordinary soft-deletable table (a
-- document can legitimately need replacing; a consent record must never
-- be edited, given what it's used to prove).
-- =============================================================================

REVOKE UPDATE, DELETE ON "patient_consents" FROM serenemed_app;
