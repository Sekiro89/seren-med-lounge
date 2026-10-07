-- Patient sex (optional, as recorded at registration) and who recorded each
-- set of vitals. Both tables already have tenant isolation; no RLS change.
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

ALTER TABLE "patients" ADD COLUMN "sex" "Sex";

ALTER TABLE "vitals" ADD COLUMN "recordedById" TEXT;
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
