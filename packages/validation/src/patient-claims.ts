import { z } from 'zod';

/**
 * Patient Record Claim Rules — staff resolving a PatientClaimRequest
 * (see docs/architecture/open-questions.md#3 and
 * apps/api/src/patient-claims). `patientId` must name a Patient in the
 * caller's own organization — enforced by PatientClaimsService's
 * tenant-scoped lookup, not by this schema.
 */
export const linkClaimSchema = z.object({
  patientId: z.string().min(1),
});

export type LinkClaimInput = z.infer<typeof linkClaimSchema>;

export const rejectClaimSchema = z.object({
  reason: z.string().min(1).optional(),
});

export type RejectClaimInput = z.infer<typeof rejectClaimSchema>;

export const escalateClaimSchema = z.object({
  reason: z.string().min(1).optional(),
});

export type EscalateClaimInput = z.infer<typeof escalateClaimSchema>;

/**
 * POST /auth/patient/activate — redeeming a Reception-issued activation
 * code (see PatientActivationToken in schema.prisma). organizationId
 * optional for the same reason as patientLoginSchema's.
 */
export const activatePatientAccountSchema = z.object({
  organizationId: z.string().min(1).optional(),
  code: z.string().min(1),
  password: z.string().min(8),
});

export type ActivatePatientAccountInput = z.infer<typeof activatePatientAccountSchema>;
