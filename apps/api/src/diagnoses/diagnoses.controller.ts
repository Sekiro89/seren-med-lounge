import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  diagnosisContentSchema,
  createDiagnosisDraftSchema,
  type DiagnosisContentInput,
  type CreateDiagnosisDraftInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { DiagnosesService } from './diagnoses.service';

@Controller('diagnoses')
export class DiagnosesController {
  constructor(
    private readonly diagnosesService: DiagnosesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':id')
  @RequirePermissions('patient-record:read-clinical')
  get(@Param('id') id: string) {
    return this.diagnosesService.getWithHistory(this.tenantContext.organizationId, id);
  }

  @Post()
  @RequirePermissions('diagnosis:write-draft')
  createDraft(
    @Body(new ZodValidationPipe(createDiagnosisDraftSchema)) body: CreateDiagnosisDraftInput,
  ) {
    const { encounterId, ...content } = body;
    return this.diagnosesService.createDraft(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      encounterId,
      content,
    );
  }

  /**
   * Senior Doctor / Administrator only (diagnosis:sign-off in the
   * permission matrix) — a Junior Doctor can write drafts but not
   * finalize them, matching the clinical-note sign-off split.
   */
  @Post(':id/sign-off')
  @RequirePermissions('diagnosis:sign-off')
  signOff(@Param('id') id: string) {
    return this.diagnosesService.signOff(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  @Post(':id/amend')
  @RequirePermissions('diagnosis:write-draft')
  amend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(diagnosisContentSchema)) body: DiagnosisContentInput,
  ) {
    return this.diagnosesService.amend(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
