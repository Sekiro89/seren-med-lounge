import { Module } from '@nestjs/common';

/**
 * Domain boundary placeholder — see docs/architecture/domain-modules.md.
 * Controllers/services/DTOs are added when this module's first workflow
 * is implemented; keep this file the single import site for the module
 * so AppModule never needs to know its internals.
 */
@Module({})
export class RegistrationModule {}
