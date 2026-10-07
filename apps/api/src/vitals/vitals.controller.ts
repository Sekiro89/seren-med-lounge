import { Body, Controller, Post } from '@nestjs/common';
import {
  recordMetabolicWorkupSchema,
  recordVitalSchema,
  type RecordMetabolicWorkupInput,
  type RecordVitalInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { VitalsService } from './vitals.service';

@Controller()
export class VitalsController {
  constructor(
    private readonly vitalsService: VitalsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('vitals')
  @RequirePermissions('vitals:write')
  record(@Body(new ZodValidationPipe(recordVitalSchema)) body: RecordVitalInput) {
    return this.vitalsService.record(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post('metabolic-workups')
  @RequirePermissions('vitals:write')
  recordMetabolicWorkup(
    @Body(new ZodValidationPipe(recordMetabolicWorkupSchema)) body: RecordMetabolicWorkupInput,
  ) {
    return this.vitalsService.recordMetabolicWorkup(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }
}
