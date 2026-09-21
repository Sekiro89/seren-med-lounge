import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { LoginInput } from '@serenemed/validation';
import { UsersService } from '../users/users.service';
import { TokenBlacklistService } from './token-blacklist.service';
import type { JwtPayload } from './jwt-payload.interface';

/**
 * Issues short-lived access tokens only — no refresh-token flow yet
 * (JWT_REFRESH_TTL in .env.example is reserved for it). That's a
 * deliberate scope cut, not an oversight: refresh rotation/revocation is
 * its own piece of design (rotation on use? a refresh_tokens table for
 * revocation? sliding vs. fixed expiry?) that wasn't asked for here —
 * see docs/architecture/open-questions.md.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async login(credentials: LoginInput) {
    const user = await this.usersService.findByOrgAndEmailWithPassword(
      credentials.organizationId,
      credentials.email,
    );

    // Same error for "no such user" and "wrong password" — distinguishing
    // them lets an attacker enumerate valid emails per organization.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      jti: randomUUID(),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }

  /** See docs/architecture/security.md#token-revocation. */
  async logout(jti: string, expiresAt: Date): Promise<void> {
    await this.tokenBlacklist.revoke(jti, expiresAt);
  }
}
