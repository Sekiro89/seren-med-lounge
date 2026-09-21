import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  clinicalNoteContentSchema,
  createClinicalNoteDraftSchema,
  type ClinicalNoteContentInput,
  type CreateClinicalNoteDraftInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ClinicalNotesService } from './clinical-notes.service';

@Controller('clinical-notes')
export class ClinicalNotesController {
  constructor(
    private readonly clinicalNotesService: ClinicalNotesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':id')
  @RequirePermissions('patient-record:read-clinical')
  get(@Param('id') id: string) {
    return this.clinicalNotesService.getWithHistory(this.tenantContext.organizationId, id);
  }

  @Post()
  @RequirePermissions('clinical-note:write-draft')
  createDraft(
    @Body(new ZodValidationPipe(createClinicalNoteDraftSchema)) body: CreateClinicalNoteDraftInput,
  ) {
    const { encounterId, ...content } = body;
    return this.clinicalNotesService.createDraft(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      encounterId,
      content,
    );
  }

  /**
   * Senior Doctor / Administrator only (clinical-note:sign-off in the
   * permission matrix) — a Junior Doctor can write drafts but not
   * finalize them, matching docs/workflows/doctor-consultation.md.
   */
  @Post(':id/sign-off')
  @RequirePermissions('clinical-note:sign-off')
  signOff(@Param('id') id: string) {
    return this.clinicalNotesService.signOff(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  @Post(':id/amend')
  @RequirePermissions('clinical-note:write-draft')
  amend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(clinicalNoteContentSchema)) body: ClinicalNoteContentInput,
  ) {
    return this.clinicalNotesService.amend(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
