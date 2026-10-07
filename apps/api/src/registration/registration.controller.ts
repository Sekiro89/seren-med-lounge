import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { registerVisitSchema, type RegisterVisitInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { RegistrationService } from './registration.service';

/**
 * Reception's desk: same `patient:write` permission that already governs
 * creating/finding patients — no new slug.
 */
@Controller('encounters/:encounterId/registration')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @RequirePermissions('patient:write')
  register(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(registerVisitSchema)) body: RegisterVisitInput,
  ) {
    return this.registrationService.register(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      encounterId,
      body,
    );
  }

  @Get()
  @RequirePermissions('patient:read')
  get(@Param('encounterId') encounterId: string) {
    return this.registrationService.get(this.tenantContext.organizationId, encounterId);
  }
}
