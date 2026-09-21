import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHasPermission, type Permission } from '@serenemed/permissions';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../auth/jwt-payload.interface';

/**
 * Central authorization enforcement point. Reads `request.user`, which
 * `JwtAuthGuard` populates — registered before this one in AppModule, so
 * it always runs first. This guard only decides the RBAC question, it
 * does not authenticate.
 *
 * `@RequirePermissions(...)` is a staff-RBAC concept — `ROLE_PERMISSIONS`
 * (`@serenemed/permissions`) only has entries for `StaffRole`, never
 * `PatientRole`. A patient actor hitting a permission-gated route is
 * rejected outright, before even calling `roleHasPermission` — patients
 * are authorized differently (own-record checks in the controller, e.g.
 * `PatientsController.me()`), not through this guard at all.
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

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user || user.actorType !== 'USER') {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }

    if (!required.every((permission) => roleHasPermission(user.role, permission))) {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }

    return true;
  }
}
