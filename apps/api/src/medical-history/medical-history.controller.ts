import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createMedicalHistorySchema,
  updateMedicalHistoryStatusSchema,
  type CreateMedicalHistoryInput,
  type UpdateMedicalHistoryStatusInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { MedicalHistoryService } from './medical-history.service';

@Controller('medical-history')
export class MedicalHistoryController {
  constructor(
    private readonly medicalHistoryService: MedicalHistoryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('patient-record:read-clinical')
  list(@Query('patientId') patientId?: string, @Query('includeErrors') includeErrors?: string) {
    if (!patientId) {
      throw new BadRequestException('patientId is required.');
    }
    return this.medicalHistoryService.listForPatient(
      this.tenantContext.organizationId,
      patientId,
      includeErrors === 'true',
    );
  }

  @Post()
  @RequirePermissions('medical-history:write')
  create(@Body(new ZodValidationPipe(createMedicalHistorySchema)) body: CreateMedicalHistoryInput) {
    return this.medicalHistoryService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/status')
  @RequirePermissions('medical-history:write')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMedicalHistoryStatusSchema))
    body: UpdateMedicalHistoryStatusInput,
  ) {
    return this.medicalHistoryService.updateStatus(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
