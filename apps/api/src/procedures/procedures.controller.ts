import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProcedureStatus } from '@prisma/client';
import {
  addChecklistItemSchema,
  attachConsentSchema,
  cancelProcedureSchema,
  createProcedureSchema,
  procedureEstimateSchema,
  scheduleProcedureSchema,
  setChecklistItemSchema,
  type AddChecklistItemInput,
  type AttachConsentInput,
  type CancelProcedureInput,
  type CreateProcedureInput,
  type ProcedureEstimateInput,
  type ScheduleProcedureInput,
  type SetChecklistItemInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { clinicDayRange, isDateString } from '../common/clinic-time';
import { ProceduresService } from './procedures.service';

/**
 * Every route needs procedure:manage; a SURGERY additionally needs
 * surgery:manage (checked in ProceduresService against the row's kind).
 */
@Controller('procedures')
export class ProceduresController {
  constructor(
    private readonly proceduresService: ProceduresService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get actor() {
    return { id: this.tenantContext.userId, role: this.tenantContext.staffRole };
  }

  private get org() {
    return this.tenantContext.organizationId;
  }

  /** `?patientId=`, `?status=`, `?performedById=`, `?date=YYYY-MM-DD` (scheduled that day). */
  @Get()
  @RequirePermissions('procedure:manage')
  list(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('performedById') performedById?: string,
    @Query('date') date?: string,
  ) {
    if (status && !(status in ProcedureStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    if (date && !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    return this.proceduresService.list(this.org, {
      patientId,
      status: status as ProcedureStatus | undefined,
      performedById,
      ...(date ? clinicDayRange(date) : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('procedure:manage')
  get(@Param('id') id: string) {
    return this.proceduresService.get(this.org, id);
  }

  @Post()
  @RequirePermissions('procedure:manage')
  create(@Body(new ZodValidationPipe(createProcedureSchema)) body: CreateProcedureInput) {
    return this.proceduresService.create(this.org, this.actor, body);
  }

  @Post(':id/estimate')
  @RequirePermissions('procedure:manage')
  estimate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(procedureEstimateSchema)) body: ProcedureEstimateInput,
  ) {
    return this.proceduresService.setEstimate(this.org, this.actor, id, body);
  }

  @Post(':id/schedule')
  @RequirePermissions('procedure:manage')
  schedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(scheduleProcedureSchema)) body: ScheduleProcedureInput,
  ) {
    return this.proceduresService.schedule(this.org, this.actor, id, body);
  }

  @Post(':id/consent')
  @RequirePermissions('procedure:manage')
  consent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attachConsentSchema)) body: AttachConsentInput,
  ) {
    return this.proceduresService.attachConsent(this.org, this.actor, id, body);
  }

  @Post(':id/checklist')
  @RequirePermissions('procedure:manage')
  addChecklistItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addChecklistItemSchema)) body: AddChecklistItemInput,
  ) {
    return this.proceduresService.addChecklistItem(this.org, this.actor, id, body);
  }

  @Post(':id/checklist/:itemId')
  @RequirePermissions('procedure:manage')
  setChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(setChecklistItemSchema)) body: SetChecklistItemInput,
  ) {
    return this.proceduresService.setChecklistItem(this.org, this.actor, id, itemId, body);
  }

  @Post(':id/start')
  @RequirePermissions('procedure:manage')
  start(@Param('id') id: string) {
    return this.proceduresService.start(this.org, this.actor, id);
  }

  @Post(':id/complete')
  @RequirePermissions('procedure:manage')
  complete(@Param('id') id: string) {
    return this.proceduresService.complete(this.org, this.actor, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('procedure:manage')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelProcedureSchema)) body: CancelProcedureInput,
  ) {
    return this.proceduresService.cancel(this.org, this.actor, id, body);
  }
}
