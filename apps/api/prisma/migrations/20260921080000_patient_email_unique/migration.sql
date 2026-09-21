-- Generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel schema.prisma`
-- (not `migrate dev`, which requires an interactive TTY this environment
-- doesn't have) — verified against the actual live database state, same
-- as every other migration in this project.

-- CreateIndex
CREATE UNIQUE INDEX "patients_organizationId_email_key" ON "patients"("organizationId", "email");
