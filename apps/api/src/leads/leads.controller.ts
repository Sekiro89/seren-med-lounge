import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LeadSource, LeadStatus } from '@prisma/client';
import {
  convertLeadSchema,
  createLeadSchema,
  leadActivitySchema,
  leadStatusSchema,
  type ConvertLeadInput,
  type CreateLeadInput,
  type LeadActivityInput,
  type LeadStatusInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { clinicDateString, clinicDayRange } from '../common/clinic-time';
import { LeadsService } from './leads.service';

/**
 * Reads need lead:read (MARKETING, ADMINISTRATOR, RECEPTION); writes need
 * lead:write (MARKETING, ADMINISTRATOR). Conversion creates/links a
 * patient record, so it ALSO needs patient:write — today only
 * ADMINISTRATOR holds both. TODO(product): who owns lead conversion
 * (marketing vs reception) — docs/architecture/open-questions.md#5.
 */
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  private get actorId() {
    return this.tenantContext.userId;
  }

  @Post()
  @RequirePermissions('lead:write')
  create(@Body(new ZodValidationPipe(createLeadSchema)) body: CreateLeadInput) {
    return this.leadsService.create(this.org, this.actorId, body);
  }

  /** `?status=`, `?source=`, `?campaignId=`, `?mine=true` (owned by me), `?due=today` (follow-up due today, clinic-local). */
  @Get()
  @RequirePermissions('lead:read')
  list(
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('campaignId') campaignId?: string,
    @Query('mine') mine?: string,
    @Query('due') due?: string,
  ) {
    if (status && !(status in LeadStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    if (source && !(source in LeadSource)) {
      throw new BadRequestException('Unknown source.');
    }
    if (due && due !== 'today') {
      throw new BadRequestException('due only supports "today".');
    }
    return this.leadsService.list(this.org, {
      status: status as LeadStatus | undefined,
      source: source as LeadSource | undefined,
      campaignId,
      ownerId: mine === 'true' ? this.actorId : undefined,
      due: due ? clinicDayRange(clinicDateString()) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('lead:read')
  get(@Param('id') id: string) {
    return this.leadsService.get(this.org, id);
  }

  @Post(':id/activities')
  @RequirePermissions('lead:write')
  addActivity(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadActivitySchema)) body: LeadActivityInput,
  ) {
    return this.leadsService.addActivity(this.org, this.actorId, id, body);
  }

  @Post(':id/status')
  @RequirePermissions('lead:write')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadStatusSchema)) body: LeadStatusInput,
  ) {
    return this.leadsService.setStatus(this.org, this.actorId, id, body);
  }

  @Post(':id/convert')
  @RequirePermissions('lead:write', 'patient:write')
  convert(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(convertLeadSchema)) body: ConvertLeadInput,
  ) {
    return this.leadsService.convert(this.org, this.actorId, id, body);
  }
}
