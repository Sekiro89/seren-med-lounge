import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Split out from AuthService deliberately: JwtAuthGuard (common/guards)
 * needs to check revocation on every request, and depending on the full
 * AuthService there (login logic, UsersService, bcrypt) would be a much
 * bigger dependency graph than a guard needs. Both AuthService.logout()
 * and JwtAuthGuard depend on this instead.
 *
 * See docs/architecture/security.md#token-revocation.
 */
@Injectable()
export class TokenBlacklistService {
  constructor(private readonly redis: RedisService) {}

  /** TTL equals the token's own remaining lifetime — Redis expires the entry on its own. */
  async revoke(jti: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.redis.client.set(TokenBlacklistService.key(jti), '1', 'EX', ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const value = await this.redis.client.get(TokenBlacklistService.key(jti));
    return value !== null;
  }

  private static key(jti: string): string {
    return `auth:revoked-jti:${jti}`;
  }
}
