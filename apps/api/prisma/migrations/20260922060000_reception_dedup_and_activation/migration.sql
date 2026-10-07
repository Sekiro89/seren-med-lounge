-- CreateEnum / AlterEnum / AlterTable / CreateTable / CreateIndex /
-- AddForeignKey sections below generated via `prisma migrate diff
-- --from-url <live db> --to-schema-datamodel schema.prisma --script`
-- (not `migrate dev`, which needs an interactive TTY this environment
-- doesn't have) — verified against the actual live database state, same
-- pattern as every other migration in this project. The RLS section and
-- the NOT NULL DEFAULT/DROP DEFAULT two-step (existing rows need a
-- backfill value before the column can go NOT NULL) are hand-written.

-- CreateEnum
CREATE TYPE "PatientClaimSource" AS ENUM ('SELF_SIGNUP', 'RECEPTION_INTAKE');

-- AlterEnum
ALTER TYPE "PatientClaimStatus" ADD VALUE 'ESCALATED';

-- AlterTable
-- Existing rows (from before this migration) get a placeholder
-- matchReason and keep source defaulting to SELF_SIGNUP, since every
-- PatientClaimRequest created before this migration came from the
-- self-signup flow — Reception intake didn't exist yet.
ALTER TABLE "patient_claim_requests" ADD COLUMN     "matchReason" TEXT NOT NULL DEFAULT 'legacy_unspecified',
ADD COLUMN     "source" "PatientClaimSource" NOT NULL DEFAULT 'SELF_SIGNUP',
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "patient_claim_requests" ALTER COLUMN "matchReason" DROP DEFAULT;

-- CreateTable
CREATE TABLE "patient_activation_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_activation_tokens_organizationId_idx" ON "patient_activation_tokens"("organizationId");

-- CreateIndex
CREATE INDEX "patient_activation_tokens_patientId_idx" ON "patient_activation_tokens"("patientId");

-- AddForeignKey
ALTER TABLE "patient_activation_tokens" ADD CONSTRAINT "patient_activation_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_activation_tokens" ADD CONSTRAINT "patient_activation_tokens_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_activation_tokens" ADD CONSTRAINT "patient_activation_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale).
-- =============================================================================

ALTER TABLE "patient_activation_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_activation_tokens" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "patient_activation_tokens"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
