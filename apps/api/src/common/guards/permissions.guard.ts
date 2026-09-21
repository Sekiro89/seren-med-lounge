import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHasPermission, type Permission } from '@serenemed/permissions';
import type { StaffRole } from '@serenemed/types';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Central authorization enforcement point. Reads `req.user` populated by
 * the (future) auth guard/JWT strategy in the `auth` module — this guard
 * only decides the RBAC question, it does not authenticate.
 *
 * This is the backend's own check; it exists so that authorization never
 * depends on what the frontend chose to render. See
 * docs/architecture/security.md.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole: StaffRole | undefined = request.user?.role;

    if (!userRole || !required.every((permission) => roleHasPermission(userRole, permission))) {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }

    return true;
  }
}
