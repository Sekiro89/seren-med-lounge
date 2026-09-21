/*
  Warnings:

  - Added the required column `organizationId` to the `audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Row-level tenant isolation for audit_logs (hand-written, like the
-- equivalent section in 20260921000000_init/migration.sql — Prisma has
-- no RLS support, so `prisma migrate dev` cannot generate this part).
-- Closes the gap noted in that migration's RLS comment and in
-- docs/architecture/open-questions.md#9: AuditLog now carries
-- organizationId, so it gets the same policy as clinics/users/patients.
-- See that migration's comments for the full FORCE/fail-closed rationale
-- — repeated only briefly here.
-- =============================================================================

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
