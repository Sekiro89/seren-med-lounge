import { StaffRole as PrismaStaffRole } from '@prisma/client';
import { StaffRole } from '@serenemed/types';

/**
 * Prisma generates its own `StaffRole` enum from schema.prisma's `enum
 * StaffRole` block — a separate TypeScript type from `@serenemed/types`'s,
 * even though the two are kept string-value-identical by hand (see the
 * "Keep StaffRole in sync by hand" note at the top of schema.prisma).
 * TypeScript enums are nominally typed, so the two aren't assignable to
 * each other despite matching values — these are the two conversions
 * that bridge them, so nothing outside UsersService ever needs to see
 * Prisma's copy of the enum.
 */
export function toAppStaffRole(role: PrismaStaffRole): StaffRole {
  return StaffRole[role];
}

export function toPrismaStaffRole(role: StaffRole): PrismaStaffRole {
  return PrismaStaffRole[role];
}
