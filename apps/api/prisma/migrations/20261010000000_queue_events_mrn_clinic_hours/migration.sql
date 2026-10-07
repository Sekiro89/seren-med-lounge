-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "mrn" TEXT;

-- CreateTable
CREATE TABLE "queue_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "station" "QueueStation" NOT NULL,
    "status" "QueueStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "queue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_hours" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queue_events_queueEntryId_at_idx" ON "queue_events"("queueEntryId", "at");

-- CreateIndex
CREATE INDEX "queue_events_organizationId_idx" ON "queue_events"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_hours_organizationId_dayOfWeek_key" ON "clinic_hours"("organizationId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organizationId_mrn_key" ON "patients"("organizationId", "mrn");

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_hours" ADD CONSTRAINT "clinic_hours_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

-- Patient numbers: backfill every existing patient with "SM-" + a 6-digit
-- sequence per organization, oldest first (ties broken by id so the order
-- is deterministic). New patients get the next number from
-- PatientsService.allocateMrn.
UPDATE "patients" AS p
SET "mrn" = 'SM-' || lpad(s.n::text, 6, '0')
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", "id") AS n
  FROM "patients"
) AS s
WHERE p."id" = s."id" AND p."mrn" IS NULL;

-- Queue stage history: existing tokens get one event, at the time they
-- were issued, recording where they are now (the earlier steps were never
-- recorded).
INSERT INTO "queue_events" ("id", "organizationId", "queueEntryId", "station", "status", "at")
SELECT gen_random_uuid()::text, "organizationId", "id", "station", "status", "createdAt"
FROM "queue_entries";

-- Opening hours: 24-hour HH:MM, and a day must close after it opens.
ALTER TABLE "clinic_hours" ADD CONSTRAINT "clinic_hours_day_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "clinic_hours" ADD CONSTRAINT "clinic_hours_time_format_check" CHECK (
  "opensAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "closesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
ALTER TABLE "clinic_hours" ADD CONSTRAINT "clinic_hours_open_before_close_check" CHECK ("opensAt" < "closesAt");

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "queue_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queue_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "queue_events"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "clinic_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_hours" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinic_hours"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Append-only tables: the app role can never edit or remove a row.
REVOKE UPDATE, DELETE ON "queue_events" FROM serenemed_app;
