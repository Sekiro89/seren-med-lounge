import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  linkClaimSchema,
  rejectClaimSchema,
  escalateClaimSchema,
  type LinkClaimInput,
  type RejectClaimInput,
  type EscalateClaimInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PatientClaimsService } from './patient-claims.service';

@Controller('patient-claims')
export class PatientClaimsController {
  constructor(
    private readonly patientClaimsService: PatientClaimsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('patient:write')
  list() {
    return this.patientClaimsService.list(this.tenantContext.organizationId);
  }

  @Post(':id/link')
  @RequirePermissions('patient:write')
  link(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkClaimSchema)) body: LinkClaimInput,
  ) {
    return this.patientClaimsService.linkToExisting(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body.patientId,
    );
  }

  @Post(':id/create-new')
  @RequirePermissions('patient:write')
  createNew(@Param('id') id: string) {
    return this.patientClaimsService.createNewForClaim(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  @Post(':id/reject')
  @RequirePermissions('patient:write')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectClaimSchema)) body: RejectClaimInput,
  ) {
    return this.patientClaimsService.reject(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body.reason,
    );
  }

  @Post(':id/escalate')
  @RequirePermissions('patient:write')
  escalate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(escalateClaimSchema)) body: EscalateClaimInput,
  ) {
    return this.patientClaimsService.escalate(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body.reason,
    );
  }
}
