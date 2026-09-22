-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The RLS and REVOKE sections at the bottom are hand-written — Prisma
-- has no support for either.

-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('ORDERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "authorId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "labOrderItemId" TEXT NOT NULL,
    "resultValue" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_orders_organizationId_deletedAt_idx" ON "lab_orders"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "lab_orders_encounterId_idx" ON "lab_orders"("encounterId");

-- CreateIndex
CREATE INDEX "lab_orders_patientId_idx" ON "lab_orders"("patientId");

-- CreateIndex
CREATE INDEX "lab_order_items_organizationId_idx" ON "lab_order_items"("organizationId");

-- CreateIndex
CREATE INDEX "lab_order_items_labOrderId_idx" ON "lab_order_items"("labOrderId");

-- CreateIndex
CREATE INDEX "lab_results_organizationId_idx" ON "lab_results"("organizationId");

-- CreateIndex
CREATE INDEX "lab_results_labOrderItemId_idx" ON "lab_results"("labOrderItemId");

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "lab_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_labOrderItemId_fkey" FOREIGN KEY ("labOrderItemId") REFERENCES "lab_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation (hand-written — see provenance note above,
-- and prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale). All three tables carry organizationId,
-- so all three get the same policy.
-- =============================================================================

ALTER TABLE "lab_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_order_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_results" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "lab_orders"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "lab_order_items"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "lab_results"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- =============================================================================
-- Lab content immutability, enforced by the database, not just app
-- discipline — same treatment as prescription_items/clinical_note_versions/
-- diagnosis_versions. Applies to lab_order_items (the ordered test) AND
-- lab_results (the reported result): once either exists, it can never
-- be changed or removed. lab_orders itself stays mutable (status
-- ORDERED -> CANCELLED, a lifecycle transition, same as
-- prescriptions.status). A corrected result is a NEW lab_results row
-- against the same lab_order_items row, never an edit of the original.
-- =============================================================================

REVOKE UPDATE, DELETE ON "lab_order_items" FROM serenemed_app;
REVOKE UPDATE, DELETE ON "lab_results" FROM serenemed_app;
