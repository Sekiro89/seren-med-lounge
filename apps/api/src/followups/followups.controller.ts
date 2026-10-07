import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import {
  bookFollowUpSchema,
  createFollowUpSchema,
  escalateFollowUpSchema,
  resolveFollowUpSchema,
  type BookFollowUpInput,
  type CreateFollowUpInput,
  type EscalateFollowUpInput,
  type ResolveFollowUpInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { FollowupsService } from './followups.service';

/**
 * Booking a review appointment from here needs follow-up:manage, not
 * appointment:write — the booking is part of the follow-up workflow
 * (docs/workflows/follow-up.md), done through AppointmentsService.
 */
@Controller('follow-ups')
export class FollowupsController {
  constructor(
    private readonly followupsService: FollowupsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?view=today|overdue` (open items only), `?patientId=`, `?status=`, `?mine=true`. */
  @Get()
  @RequirePermissions('follow-up:manage')
  list(
    @Query('view') view?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    if (view && view !== 'today' && view !== 'overdue') {
      throw new BadRequestException('view must be today or overdue.');
    }
    if (status && !(status in FollowUpStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.followupsService.list(this.tenantContext.organizationId, {
      view: view as 'today' | 'overdue' | undefined,
      patientId,
      status: status as FollowUpStatus | undefined,
      assignedToId: mine === 'true' ? this.tenantContext.userId : undefined,
    });
  }

  @Post()
  @RequirePermissions('follow-up:manage')
  create(@Body(new ZodValidationPipe(createFollowUpSchema)) body: CreateFollowUpInput) {
    return this.followupsService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/done')
  @RequirePermissions('follow-up:manage')
  done(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveFollowUpSchema)) body: ResolveFollowUpInput,
  ) {
    return this.resolve(id, 'done', body);
  }

  @Post(':id/missed')
  @RequirePermissions('follow-up:manage')
  missed(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveFollowUpSchema)) body: ResolveFollowUpInput,
  ) {
    return this.resolve(id, 'missed', body);
  }

  @Post(':id/cancel')
  @RequirePermissions('follow-up:manage')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveFollowUpSchema)) body: ResolveFollowUpInput,
  ) {
    return this.resolve(id, 'cancel', body);
  }

  @Post(':id/escalate')
  @RequirePermissions('follow-up:manage')
  escalate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(escalateFollowUpSchema)) body: EscalateFollowUpInput,
  ) {
    return this.followupsService.escalate(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }

  @Post(':id/book')
  @RequirePermissions('follow-up:manage')
  book(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bookFollowUpSchema)) body: BookFollowUpInput,
  ) {
    return this.followupsService.book(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }

  private resolve(
    id: string,
    resolution: 'done' | 'missed' | 'cancel',
    body: ResolveFollowUpInput,
  ) {
    return this.followupsService.resolve(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      resolution,
      body,
    );
  }
}
