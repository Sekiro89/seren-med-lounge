import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { patientRegistrationSchema, type PatientRegistrationInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PatientsService } from './patients.service';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('patient:read')
  list(@Query('q') q?: string) {
    return this.patientsService.listForOrganization(this.tenantContext.organizationId, q);
  }

  @Post()
  @RequirePermissions('patient:write')
  register(@Body(new ZodValidationPipe(patientRegistrationSchema)) body: PatientRegistrationInput) {
    return this.patientsService.register(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  /**
   * No @RequirePermissions() — this isn't gated by StaffRole permissions
   * at all (patients don't have any). Authorization here is "are you a
   * patient, and is this your own record" — checked explicitly below,
   * not via PermissionsGuard, which only understands staff RBAC. `id`
   * comes from the verified JWT (`request.user.userId`), never from a
   * URL param or body, so there's no way to request a different
   * patient's record through this route (no IDOR surface).
   */
  @Get('me')
  async me(@Req() request: Request & { user: AuthenticatedUser }) {
    if (request.user.actorType !== 'PATIENT') {
      throw new ForbiddenException('Only a patient can access their own record this way.');
    }
    return this.patientsService.findOwnProfile(request.user.organizationId, request.user.userId);
  }
}
