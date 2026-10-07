-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- The CHECK, RLS and REVOKE sections at the bottom are hand-written —
-- Prisma has no support for any of them.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('CONSULTATION', 'PROCEDURE', 'LAB', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedById" TEXT NOT NULL,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "itemType" "InvoiceItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_organizationId_deletedAt_idx" ON "invoices"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "invoices_patientId_idx" ON "invoices"("patientId");

-- CreateIndex
CREATE INDEX "invoices_encounterId_idx" ON "invoices"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_number_key" ON "invoices"("organizationId", "number");

-- CreateIndex
CREATE INDEX "invoice_items_organizationId_idx" ON "invoice_items"("organizationId");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "refunds_organizationId_idx" ON "refunds"("organizationId");

-- CreateIndex
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Money invariants, enforced by the database, not just PaymentsService /
-- InvoicesService — a bug in app code can't produce a negative amount or
-- an invoice "paid" beyond its total.
-- =============================================================================

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_check" CHECK (
  "subtotalMinor" >= 0 AND "taxMinor" >= 0
  AND "totalMinor" = "subtotalMinor" + "taxMinor"
  AND "paidMinor" >= 0 AND "paidMinor" <= "totalMinor"
);

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_amounts_check" CHECK (
  "quantity" > 0 AND "unitPriceMinor" >= 0 AND "taxMinor" >= 0
  AND "lineTotalMinor" = "quantity" * "unitPriceMinor" + "taxMinor"
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amountMinor" > 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amountMinor" > 0);

-- =============================================================================
-- Row-level tenant isolation (hand-written — see
-- prisma/migrations/20260921000000_init/migration.sql for the full
-- FORCE/fail-closed rationale). All four tables carry organizationId.
-- =============================================================================

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "invoices"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "invoice_items"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "payments"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

CREATE POLICY "tenant_isolation" ON "refunds"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- =============================================================================
-- Financial-record immutability — same treatment as prescription_items /
-- lab_results. invoices itself stays mutable (status, paidMinor, void
-- fields — a lifecycle, like prescriptions.status), but a billed line, a
-- received payment and an issued refund can never be edited or removed.
-- Correction paths: void + reissue an invoice; refund a payment.
-- =============================================================================

REVOKE UPDATE, DELETE ON "invoice_items" FROM serenemed_app;
REVOKE UPDATE, DELETE ON "payments" FROM serenemed_app;
REVOKE UPDATE, DELETE ON "refunds" FROM serenemed_app;
