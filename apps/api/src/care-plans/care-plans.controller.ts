import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { createCarePlanSchema, type CreateCarePlanInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { CarePlansService } from './care-plans.service';

@Controller('care-plans')
export class CarePlansController {
  constructor(
    private readonly carePlansService: CarePlansService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('follow-up:manage')
  list(@Query('patientId') patientId?: string) {
    if (!patientId) {
      throw new BadRequestException('patientId is required.');
    }
    return this.carePlansService.list(this.tenantContext.organizationId, patientId);
  }

  @Post()
  @RequirePermissions('follow-up:manage')
  create(@Body(new ZodValidationPipe(createCarePlanSchema)) body: CreateCarePlanInput) {
    return this.carePlansService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/complete')
  @RequirePermissions('follow-up:manage')
  complete(@Param('id') id: string) {
    return this.carePlansService.complete(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('follow-up:manage')
  cancel(@Param('id') id: string) {
    return this.carePlansService.cancel(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }
}
