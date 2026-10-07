-- CreateTable / CreateIndex / AddForeignKey sections below generated via
-- `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The RLS section at the bottom is hand-written — Prisma has no support
-- for it. No REVOKE UPDATE/DELETE here (unlike lab_results/
-- clinical_note_versions) — this table's status/resolved* fields are
-- meant to be mutated during staff resolution, see the model's doc
-- comment in schema.prisma.

-- CreateEnum
CREATE TYPE "PatientClaimStatus" AS ENUM ('PENDING', 'LINKED', 'CREATED_NEW', 'REJECTED');

-- CreateTable
CREATE TABLE "patient_claim_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "candidatePatientIds" JSONB NOT NULL,
    "status" "PatientClaimStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedPatientId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_claim_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_claim_requests_organizationId_status_idx" ON "patient_claim_requests"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "patient_claim_requests" ADD CONSTRAINT "patient_claim_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale).
-- =============================================================================

ALTER TABLE "patient_claim_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_claim_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "patient_claim_requests"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
