import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createPrescriptionSchema, type CreatePrescriptionInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PrescriptionsService } from './prescriptions.service';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':id')
  @RequirePermissions('patient-record:read-clinical')
  get(@Param('id') id: string) {
    return this.prescriptionsService.get(this.tenantContext.organizationId, id);
  }

  @Post()
  @RequirePermissions('prescription:write')
  create(@Body(new ZodValidationPipe(createPrescriptionSchema)) body: CreatePrescriptionInput) {
    return this.prescriptionsService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('prescription:write')
  cancel(@Param('id') id: string) {
    return this.prescriptionsService.cancel(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }
}
