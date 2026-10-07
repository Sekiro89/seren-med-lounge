-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('REVIEW_APPOINTMENT', 'MEDICATION_REMINDER', 'RECOVERY_CHECK', 'REPORT_ALERT', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'DONE', 'MISSED', 'ESCALATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "care_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "title" TEXT NOT NULL,
    "dischargeInstructions" TEXT,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "carePlanId" TEXT,
    "type" "FollowUpType" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" TEXT,
    "assignedToId" TEXT,
    "appointmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_plans_organizationId_status_idx" ON "care_plans"("organizationId", "status");

-- CreateIndex
CREATE INDEX "care_plans_patientId_idx" ON "care_plans"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_appointmentId_key" ON "follow_ups"("appointmentId");

-- CreateIndex
CREATE INDEX "follow_ups_organizationId_status_dueAt_idx" ON "follow_ups"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "follow_ups_patientId_idx" ON "follow_ups"("patientId");

-- CreateIndex
CREATE INDEX "follow_ups_assignedToId_status_idx" ON "follow_ups"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "care_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "care_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "care_plans" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "care_plans"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follow_ups" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "follow_ups"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
