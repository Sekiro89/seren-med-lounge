import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';

/**
 * For patient-facing routes outside PatientsController: "is the caller a
 * patient" — the same ownership check PatientsController.requirePatient
 * does. Use the returned user's `userId` as the patient id; never a
 * client-supplied one.
 */
export function requirePatient(
  request: Request & { user: AuthenticatedUser },
): Extract<AuthenticatedUser, { actorType: 'PATIENT' }> {
  if (request.user.actorType !== 'PATIENT') {
    throw new ForbiddenException('Only a patient can access their own record this way.');
  }
  return request.user;
}
