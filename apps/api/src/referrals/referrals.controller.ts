import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReferralStatus } from '@prisma/client';
import {
  closeReferralSchema,
  createReferralSchema,
  type CloseReferralInput,
  type CreateReferralInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(
    private readonly referralsService: ReferralsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?patientId=`, `?status=`, or `?mine=true` for referrals addressed to the caller. */
  @Get()
  @RequirePermissions('patient-record:read-clinical')
  list(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ) {
    if (status && !(status in ReferralStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.referralsService.list(this.tenantContext.organizationId, {
      patientId,
      status: status as ReferralStatus | undefined,
      toUserId: mine === 'true' ? this.tenantContext.userId : undefined,
    });
  }

  @Post()
  @RequirePermissions('referral:write')
  create(@Body(new ZodValidationPipe(createReferralSchema)) body: CreateReferralInput) {
    return this.referralsService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/complete')
  @RequirePermissions('referral:write')
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeReferralSchema)) body: CloseReferralInput,
  ) {
    return this.referralsService.close(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      'complete',
      body,
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('referral:write')
  cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeReferralSchema)) body: CloseReferralInput,
  ) {
    return this.referralsService.close(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      'cancel',
      body,
    );
  }
}
