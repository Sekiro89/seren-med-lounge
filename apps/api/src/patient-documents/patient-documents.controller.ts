import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  registerPatientDocumentSchema,
  type RegisterPatientDocumentInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PatientDocumentsService } from './patient-documents.service';

/**
 * Gated by patient:write/patient:read (no dedicated document permission
 * slug) — this is captured at OPD registration, the same desk that
 * already writes the Patient record itself (Reception/Administrator).
 */
@Controller('patient-documents')
export class PatientDocumentsController {
  constructor(
    private readonly patientDocumentsService: PatientDocumentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('patient/:patientId')
  @RequirePermissions('patient:read')
  listForPatient(@Param('patientId') patientId: string) {
    return this.patientDocumentsService.listForPatient(
      this.tenantContext.organizationId,
      patientId,
    );
  }

  @Post()
  @RequirePermissions('patient:write')
  register(
    @Body(new ZodValidationPipe(registerPatientDocumentSchema))
    body: RegisterPatientDocumentInput,
  ) {
    return this.patientDocumentsService.register(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/remove')
  @RequirePermissions('patient:write')
  remove(@Param('id') id: string) {
    return this.patientDocumentsService.remove(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }
}
