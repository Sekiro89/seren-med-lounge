import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  loginSchema,
  patientLoginSchema,
  patientSignupSchema,
  type LoginInput,
  type PatientLoginInput,
  type PatientSignupInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { PatientAuthService } from './patient-auth.service';
import type { AuthenticatedUser } from './jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly patientAuthService: PatientAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A patient shouldn't have to know an internal organizationId to sign
   * up or log in — see patientLoginSchema's comment in
   * @serenemed/validation. An explicit value in the request body still
   * wins when present; env.DEFAULT_ORGANIZATION_ID is the fallback for
   * today's real single-clinic-per-deployment case, not a guess at the
   * eventual multi-tenant resolution (subdomain, custom domain — see
   * docs/architecture/open-questions.md#4).
   */
  private resolveOrganizationId(explicit?: string): string {
    if (explicit) {
      return explicit;
    }
    const fallback = this.config.get<string>('DEFAULT_ORGANIZATION_ID');
    if (!fallback) {
      throw new ServiceUnavailableException(
        'No organizationId was provided and this deployment has no DEFAULT_ORGANIZATION_ID configured.',
      );
    }
    return fallback;
  }

  // Much stricter than the app-wide default (100/min) — this is a
  // public, unauthenticated endpoint that checks a password, i.e.
  // exactly what brute-forcing targets. 5 attempts/minute per IP is
  // generous for a real user (mistypes a password a couple of times)
  // and expensive for an attacker (300/hour max, tracked per source IP —
  // see docs/architecture/security.md#rate-limiting for what this does
  // and doesn't protect against).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authService.login(body);
  }

  /**
   * Not @Public() — needs JwtAuthGuard to have already verified the
   * token and populated request.user (jti, expiresAt) before this can
   * revoke it. Revokes only the token presented on this request; other
   * active sessions for the same user are unaffected — see
   * docs/architecture/security.md#token-revocation.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request & { user: AuthenticatedUser }) {
    await this.authService.logout(request.user.jti, new Date(request.user.expiresAt * 1000));
  }

  /**
   * Against the Patient table via PatientAuthService, never User — same
   * rate limit rationale as /auth/login — also a public,
   * password-checking endpoint. organizationId is optional here (unlike
   * staff login) — see patientLoginSchema's comment and
   * resolveOrganizationId above.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('patient/login')
  patientLogin(@Body(new ZodValidationPipe(patientLoginSchema)) body: PatientLoginInput) {
    return this.patientAuthService.login(this.resolveOrganizationId(body.organizationId), body);
  }

  @Post('patient/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async patientLogout(@Req() request: Request & { user: AuthenticatedUser }) {
    await this.patientAuthService.logout(request.user.jti, new Date(request.user.expiresAt * 1000));
  }

  /**
   * The gap this whole feature closes: before this route existed, the
   * only way a Patient row got created at all was staff doing it
   * (POST /patients) or the dev seed script — see
   * docs/architecture/open-questions.md#3. Same rate limit as login/
   * signup above (also public, and account creation is exactly the kind
   * of endpoint spam-signup abuse targets).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post('patient/signup')
  patientSignup(@Body(new ZodValidationPipe(patientSignupSchema)) body: PatientSignupInput) {
    return this.patientAuthService.signup(this.resolveOrganizationId(body.organizationId), body);
  }
}
