import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { recordPatientConsentSchema, type RecordPatientConsentInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PatientConsentService } from './patient-consent.service';

@Controller('patient-consent')
export class PatientConsentController {
  constructor(
    private readonly patientConsentService: PatientConsentService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('patient/:patientId')
  @RequirePermissions('patient:read')
  getForPatient(@Param('patientId') patientId: string) {
    return this.patientConsentService.getForPatient(this.tenantContext.organizationId, patientId);
  }

  @Post()
  @RequirePermissions('patient:write')
  record(@Body(new ZodValidationPipe(recordPatientConsentSchema)) body: RecordPatientConsentInput) {
    return this.patientConsentService.record(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }
}
