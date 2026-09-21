import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser, JwtPayload } from '../../auth/jwt-payload.interface';

/**
 * Global, default-deny authentication. Every route requires a valid
 * Bearer access token unless decorated `@Public()`. Runs before
 * PermissionsGuard (registration order in AppModule matters) so
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

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user: AuthenticatedUser = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
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
