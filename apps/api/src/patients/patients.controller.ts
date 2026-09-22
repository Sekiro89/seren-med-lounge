import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { patientRegistrationSchema, type PatientRegistrationInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PatientsService } from './patients.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { DiagnosesService } from '../diagnoses/diagnoses.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { LabsService } from '../labs/labs.service';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly tenantContext: TenantContextService,
    private readonly appointmentsService: AppointmentsService,
    private readonly diagnosesService: DiagnosesService,
    private readonly prescriptionsService: PrescriptionsService,
    private readonly labsService: LabsService,
  ) {}

  /**
   * Shared by every /patients/me/* route below — "are you a patient,
   * and is this your own record," the same ownership check `me()`
   * already used, factored out once four routes needed it instead of
   * copy-pasted four times.
   */
  private requirePatient(
    request: Request & { user: AuthenticatedUser },
  ): Extract<AuthenticatedUser, { actorType: 'PATIENT' }> {
    if (request.user.actorType !== 'PATIENT') {
      throw new ForbiddenException('Only a patient can access their own record this way.');
    }
    return request.user;
  }

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
  me(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = this.requirePatient(request);
    return this.patientsService.findOwnProfile(user.organizationId, user.userId);
  }

  /**
   * The four routes below are the read half of the "close the loop"
   * ask: everything staff-web can create for a patient
   * (appointment/diagnosis/prescription/lab order), the patient can now
   * see for themselves. Same ownership-not-RBAC authorization as `me()`
   * above — ordinary Patient actors reach these, not staff, and always
   * scoped to their own `userId`, never a client-supplied patient id.
   */
  @Get('me/appointments')
  myAppointments(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = this.requirePatient(request);
    return this.appointmentsService.listForPatient(user.organizationId, user.userId);
  }

  @Get('me/diagnoses')
  myDiagnoses(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = this.requirePatient(request);
    return this.diagnosesService.listForPatient(user.organizationId, user.userId);
  }

  @Get('me/prescriptions')
  myPrescriptions(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = this.requirePatient(request);
    return this.prescriptionsService.listForPatient(user.organizationId, user.userId);
  }

  @Get('me/lab-orders')
  myLabOrders(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = this.requirePatient(request);
    return this.labsService.listOrdersForPatient(user.organizationId, user.userId);
  }
}
