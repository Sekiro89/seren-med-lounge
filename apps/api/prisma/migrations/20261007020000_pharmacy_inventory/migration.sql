-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateEnum
CREATE TYPE "MedicationForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'INHALER', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'DISPENSE', 'RETURN', 'ADJUSTMENT', 'WASTAGE');

-- CreateEnum
CREATE TYPE "DispensingStatus" AS ENUM ('PREPARED', 'HANDED_OVER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfilmentMode" AS ENUM ('PICKUP', 'HOME_DELIVERY');

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "form" "MedicationForm" NOT NULL,
    "strength" TEXT,
    "unit" TEXT NOT NULL,
    "unitPriceMinor" INTEGER,
    "reorderLevel" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityOnHand" INTEGER NOT NULL,
    "unitCostMinor" INTEGER,
    "supplier" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "reason" TEXT,
    "dispensingId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispensings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriptionItemId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "DispensingStatus" NOT NULL DEFAULT 'PREPARED',
    "mode" "FulfilmentMode" NOT NULL,
    "deliveryAddress" TEXT,
    "dispensedById" TEXT NOT NULL,
    "handedOverAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispensings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medications_organizationId_deletedAt_idx" ON "medications"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "medications_organizationId_name_idx" ON "medications"("organizationId", "name");

-- CreateIndex
CREATE INDEX "stock_batches_medicationId_expiryDate_idx" ON "stock_batches"("medicationId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_organizationId_medicationId_batchNumber_key" ON "stock_batches"("organizationId", "medicationId", "batchNumber");

-- CreateIndex
CREATE INDEX "stock_movements_organizationId_idx" ON "stock_movements"("organizationId");

-- CreateIndex
CREATE INDEX "stock_movements_batchId_idx" ON "stock_movements"("batchId");

-- CreateIndex
CREATE INDEX "stock_movements_medicationId_createdAt_idx" ON "stock_movements"("medicationId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_dispensingId_idx" ON "stock_movements"("dispensingId");

-- CreateIndex
CREATE INDEX "dispensings_organizationId_status_idx" ON "dispensings"("organizationId", "status");

-- CreateIndex
CREATE INDEX "dispensings_patientId_idx" ON "dispensings"("patientId");

-- CreateIndex
CREATE INDEX "dispensings_prescriptionItemId_idx" ON "dispensings"("prescriptionItemId");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_dispensingId_fkey" FOREIGN KEY ("dispensingId") REFERENCES "dispensings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "prescription_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

ALTER TABLE "medications" ADD CONSTRAINT "medications_amounts_check" CHECK (
  ("unitPriceMinor" IS NULL OR "unitPriceMinor" >= 0) AND ("reorderLevel" IS NULL OR "reorderLevel" >= 0)
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_quantity_check" CHECK (
  "quantityReceived" > 0 AND "quantityOnHand" >= 0 AND ("unitCostMinor" IS NULL OR "unitCostMinor" >= 0)
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sign_check" CHECK (
  ("type" IN ('RECEIPT', 'RETURN') AND "quantityDelta" > 0)
  OR ("type" IN ('DISPENSE', 'WASTAGE') AND "quantityDelta" < 0)
  OR ("type" = 'ADJUSTMENT' AND "quantityDelta" <> 0)
);
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "dispensings" ADD CONSTRAINT "dispensings_delivery_check" CHECK (
  "mode" = 'PICKUP' OR "deliveryAddress" IS NOT NULL
);

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "medications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "medications"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "stock_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_batches"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_movements"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "dispensings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispensings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dispensings"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Append-only tables: the app role can never edit or remove a row.
REVOKE UPDATE, DELETE ON "stock_movements" FROM serenemed_app;
