-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- AlterTable
ALTER TABLE "queue_entries" ADD COLUMN     "waitingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- =============================================================================
-- hand-written
-- =============================================================================

-- Existing tokens: best estimate of when they reached their current station.
UPDATE "queue_entries" SET "waitingSince" = "updatedAt";
