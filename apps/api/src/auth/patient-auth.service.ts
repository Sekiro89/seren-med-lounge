import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PatientRole } from '@serenemed/types';
import type { LoginInput } from '@serenemed/validation';
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

  async login(credentials: LoginInput) {
    const patient = await this.patientsService.findByOrgAndEmailWithPassword(
      credentials.organizationId,
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

    const payload: JwtPayload = {
      sub: patient.id,
      organizationId: patient.organizationId,
      role: PatientRole.PATIENT,
      actorType: 'PATIENT',
      jti: randomUUID(),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      patient: {
        id: patient.id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        organizationId: patient.organizationId,
      },
    };
  }

  /** See docs/architecture/security.md#token-revocation. */
  async logout(jti: string, expiresAt: Date): Promise<void> {
    await this.tokenBlacklist.revoke(jti, expiresAt);
  }
}
