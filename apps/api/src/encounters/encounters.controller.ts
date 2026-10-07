import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { dischargeEncounterSchema, type DischargeEncounterInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { EncountersService } from './encounters.service';

@Controller('encounters')
export class EncountersController {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':id')
  @RequirePermissions('patient-record:read-clinical')
  get(@Param('id') id: string) {
    return this.encountersService.getDetail(this.tenantContext.organizationId, id);
  }

  /** Senior doctor / admin — closes the visit; see EncountersService.discharge. */
  @Post(':id/discharge')
  @RequirePermissions('patient-record:write-clinical')
  discharge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dischargeEncounterSchema)) body: DischargeEncounterInput,
  ) {
    return this.encountersService.discharge(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
