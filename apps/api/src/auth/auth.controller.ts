import { Body, Controller, HttpCode, HttpStatus, Post, Req, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { loginSchema, type LoginInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
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
}
