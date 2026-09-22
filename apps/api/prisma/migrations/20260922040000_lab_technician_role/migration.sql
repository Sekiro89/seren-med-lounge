-- Generated via `prisma migrate diff --from-url <live db>
-- --to-schema-datamodel schema.prisma --script` (not `migrate dev`,
-- which needs an interactive TTY this environment doesn't have) —
-- verified against the actual live database state, same pattern as
-- every other migration in this project.
--
-- Closes the gap flagged in docs/architecture/security.md's LabOrder
-- section: lab-result:write previously had only ADMINISTRATOR behind it
-- because no lab-technician StaffRole existed. See
-- packages/permissions/src/matrix.ts for the new role's grants.

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'LAB_TECHNICIAN';
