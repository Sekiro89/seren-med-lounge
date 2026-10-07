import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { InsuranceCaseStatus } from '@prisma/client';
import {
  createInsuranceCaseSchema,
  createInsurancePolicySchema,
  insuranceCaseNoteSchema,
  insuranceTransitionSchema,
  settleInsuranceCaseSchema,
  type CreateInsuranceCaseInput,
  type CreateInsurancePolicyInput,
  type InsuranceCaseNoteInput,
  type InsuranceTransitionInput,
  type SettleInsuranceCaseInput,
} from '@serenemed/validation';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { requirePatient } from '../common/require-patient';
import { TenantContextService } from '../prisma/tenant-context.service';
import { InsuranceService } from './insurance.service';

/**
 * Staff routes need insurance:manage (INSURANCE, ADMINISTRATOR). The
 * patient sees their own policies at /patients/me/insurance-policies.
 */
@Controller()
export class InsuranceController {
  constructor(
    private readonly insuranceService: InsuranceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  private get actorId() {
    return this.tenantContext.userId;
  }

  @Post('insurance/policies')
  @RequirePermissions('insurance:manage')
  createPolicy(
    @Body(new ZodValidationPipe(createInsurancePolicySchema)) body: CreateInsurancePolicyInput,
  ) {
    return this.insuranceService.createPolicy(this.org, this.actorId, body);
  }

  @Get('insurance/policies')
  @RequirePermissions('insurance:manage')
  listPolicies(@Query('patientId') patientId?: string) {
    return this.insuranceService.listPolicies(this.org, { patientId });
  }

  @Post('insurance/policies/:id/deactivate')
  @RequirePermissions('insurance:manage')
  deactivatePolicy(@Param('id') id: string) {
    return this.insuranceService.deactivatePolicy(this.org, this.actorId, id);
  }

  @Get('patients/me/insurance-policies')
  myPolicies(@Req() request: Request & { user: AuthenticatedUser }) {
    const patient = requirePatient(request);
    return this.insuranceService.listPoliciesForPatient(patient.organizationId, patient.userId);
  }

  @Post('insurance/cases')
  @RequirePermissions('insurance:manage')
  createCase(
    @Body(new ZodValidationPipe(createInsuranceCaseSchema)) body: CreateInsuranceCaseInput,
  ) {
    return this.insuranceService.createCase(this.org, this.actorId, body);
  }

  /** `?status=`, `?patientId=` */
  @Get('insurance/cases')
  @RequirePermissions('insurance:manage')
  listCases(@Query('status') status?: string, @Query('patientId') patientId?: string) {
    if (status && !(status in InsuranceCaseStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.insuranceService.listCases(this.org, {
      status: status as InsuranceCaseStatus | undefined,
      patientId,
    });
  }

  @Get('insurance/cases/:id')
  @RequirePermissions('insurance:manage')
  getCase(@Param('id') id: string) {
    return this.insuranceService.getCase(this.org, id);
  }

  @Post('insurance/cases/:id/transition')
  @RequirePermissions('insurance:manage')
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(insuranceTransitionSchema)) body: InsuranceTransitionInput,
  ) {
    return this.insuranceService.transition(this.org, this.actorId, id, body);
  }

  @Post('insurance/cases/:id/notes')
  @RequirePermissions('insurance:manage')
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(insuranceCaseNoteSchema)) body: InsuranceCaseNoteInput,
  ) {
    return this.insuranceService.addNote(this.org, this.actorId, id, body);
  }

  @Post('insurance/cases/:id/settle')
  @RequirePermissions('insurance:manage')
  settle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(settleInsuranceCaseSchema)) body: SettleInsuranceCaseInput,
  ) {
    return this.insuranceService.settle(this.org, this.actorId, id, body);
  }
}
