import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';

/**
 * Request-scoped — NestJS instantiates one of these per request (and
 * makes anything that injects it request-scoped too, which has a real
 * perf cost: those providers can no longer be singletons. Accepted for
 * now since this sits only on the request path that needs per-request
 * identity; don't inject this into something that doesn't need it).
 *
 * Exposes the authenticated caller's organizationId so services can call
 * `prisma.withTenant(tenantContext.organizationId, tx => ...)` without
 * each one re-deriving it from the request themselves. Throws instead of
 * returning undefined if there's no authenticated user — a service
 * calling this on a `@Public()` route (where JwtAuthGuard never ran) is
 * a programming error, not a state to silently tolerate.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  constructor(@Inject(REQUEST) private readonly request: Request & { user?: AuthenticatedUser }) {}

  get organizationId(): string {
    return this.requireUser().organizationId;
  }

  get userId(): string {
    return this.requireUser().userId;
  }

  private requireUser(): AuthenticatedUser {
    if (!this.request.user) {
      throw new Error(
        'TenantContextService used on a request with no authenticated user — ' +
          'this route is either @Public() (nothing to scope by) or JwtAuthGuard ' +
          "hasn't run. Check the route isn't marked @Public() by mistake.",
      );
    }
    return this.request.user;
  }
}
