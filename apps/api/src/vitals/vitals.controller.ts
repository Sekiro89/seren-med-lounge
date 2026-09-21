import { Body, Controller, Post } from '@nestjs/common';
import { recordVitalSchema, type RecordVitalInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { VitalsService } from './vitals.service';

@Controller('vitals')
export class VitalsController {
  constructor(
    private readonly vitalsService: VitalsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  @RequirePermissions('vitals:write')
  record(@Body(new ZodValidationPipe(recordVitalSchema)) body: RecordVitalInput) {
    return this.vitalsService.record(this.tenantContext.organizationId, body);
  }
}
