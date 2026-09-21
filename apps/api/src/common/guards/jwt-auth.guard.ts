import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenBlacklistService } from '../../auth/token-blacklist.service';
import type { AuthenticatedUser, VerifiedJwtPayload } from '../../auth/jwt-payload.interface';

/**
 * Global, default-deny authentication. Every route requires a valid,
 * non-revoked Bearer access token unless decorated `@Public()`. Runs
 * before PermissionsGuard (registration order in AppModule matters) so
 * `request.user` exists by the time RBAC checks run.
 *
 * This is the piece that makes tenant isolation (PrismaService.withTenant,
 * via TenantContextService) actually reachable from a real request — see
 * docs/architecture/security.md#row-level-security and
 * docs/architecture/open-questions.md#8.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let payload: VerifiedJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<VerifiedJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    // Checked after signature/expiry verification, not before — no point
    // hitting Redis for a token that's already invalid on its own terms.
    if (await this.tokenBlacklist.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Token has been revoked.');
    }

    const user: AuthenticatedUser = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      jti: payload.jti,
      expiresAt: payload.exp,
    };
    (request as Request & { user: AuthenticatedUser }).user = user;

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice('Bearer '.length);
  }
}
