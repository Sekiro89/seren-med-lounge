import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of authentication. `JwtAuthGuard` is global and
 * default-deny: every route requires a valid Bearer token unless marked
 * `@Public()`. Use sparingly — health checks and the login endpoint
 * itself are the expected cases, not a general escape hatch.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
