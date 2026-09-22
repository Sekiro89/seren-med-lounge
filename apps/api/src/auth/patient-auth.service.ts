import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PatientRole } from '@serenemed/types';
import type { PatientLoginInput, PatientSignupInput } from '@serenemed/validation';
import { PatientsService } from '../patients/patients.service';
import { TokenBlacklistService } from './token-blacklist.service';
import type { JwtPayload } from './jwt-payload.interface';

/**
 * Mirrors AuthService (staff login) but for patients. Lives alongside
 * AuthService, not inside the `patients` module, for the same reason
 * AuthService lives here rather than in `users`: it needs JwtService/
 * TokenBlacklistService, which this module (auth) owns — putting this
 * service in `patients` instead would make `patients` depend on `auth`
 * for JWT infrastructure while `auth` depends on `patients` for the
 * controller route, a circular module dependency for no real benefit.
 *
 * Kept as a genuinely separate service from AuthService, not a branch
 * inside it — see docs/architecture/security.md#authentication: "a
 * patient is never granted a staff role by sharing a table." Same
 * reasoning extends to the service layer: no shared "actor lookup"
 * abstraction that could accidentally blur the two credential stores.
 */
@Injectable()
export class PatientAuthService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  /**
   * `organizationId` is a separate argument, not read off `credentials`
   * — the caller (AuthController.resolveOrganizationId) has already
   * decided it, whether from an explicit request field or
   * env.DEFAULT_ORGANIZATION_ID. This service stays agnostic to how
   * that resolution happened.
   */
  async login(organizationId: string, credentials: PatientLoginInput) {
    const patient = await this.patientsService.findByOrgAndEmailWithPassword(
      organizationId,
      credentials.email,
    );

    // Same error for "no such patient", "no password set" (phone/OTP-only
    // accounts — see Patient.passwordHash being nullable in schema.prisma),
    // and "wrong password" — distinguishing any of these lets a caller
    // enumerate valid emails per organization.
    if (!patient || !patient.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(credentials.password, patient.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueSession(patient.id, patient.organizationId, {
      email: patient.email,
      firstName: patient.firstName,
      lastName: patient.lastName,
    });
  }

  /**
   * POST /auth/patient/signup — creates the patient (via
   * PatientsService.selfRegister, which does the actual password
   * hashing/conflict-checking/audit-logging) and immediately logs them
   * in, same response shape as login() above, so the frontend can reuse
   * one "save the session" function for both.
   */
  async signup(organizationId: string, input: PatientSignupInput) {
    const patient = await this.patientsService.selfRegister(organizationId, input);
    return this.issueSession(patient.id, organizationId, {
      email: patient.email,
      firstName: patient.firstName,
      lastName: patient.lastName,
    });
  }

  /** See docs/architecture/security.md#token-revocation. */
  async logout(jti: string, expiresAt: Date): Promise<void> {
    await this.tokenBlacklist.revoke(jti, expiresAt);
  }

  private async issueSession(
    patientId: string,
    organizationId: string,
    profile: { email: string | null; firstName: string; lastName: string },
  ) {
    const payload: JwtPayload = {
      sub: patientId,
      organizationId,
      role: PatientRole.PATIENT,
      actorType: 'PATIENT',
      jti: randomUUID(),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      patient: {
        id: patientId,
        organizationId,
        ...profile,
      },
    };
  }
}
