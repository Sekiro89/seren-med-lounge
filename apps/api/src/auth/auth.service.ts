import { Injectable, NotImplementedException } from '@nestjs/common';
import type { LoginInput } from '@serenemed/validation';

/**
 * Boundary established (JWT issuance, password hashing, refresh tokens),
 * implementation intentionally deferred until the Users module has a
 * persisted credential to check against. See docs/architecture/security.md
 * for the intended password-hashing / JWT-lifetime approach.
 */
@Injectable()
export class AuthService {
  login(_credentials: LoginInput): never {
    throw new NotImplementedException('Auth is not wired to a user store yet.');
  }
}
