import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createAppointmentSchema, type CreateAppointmentInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('appointment:read')
  list() {
    return this.appointmentsService.listForOrganization(this.tenantContext.organizationId);
  }

  @Post()
  @RequirePermissions('appointment:write')
  create(@Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput) {
    return this.appointmentsService.create(this.tenantContext.organizationId, body);
  }

  /**
   * Reception (or admin) checks a patient in — see
   * AppointmentsService.checkIn() for the multi-table transaction this
   * triggers (appointment status update + Encounter creation, atomic).
   * Gated by the same permission as booking, not a new one — check-in is
   * part of the same reception workflow docs/workflows/clinic-journey.md
   * describes, not a distinct capability.
   */
  @Post(':id/check-in')
  @RequirePermissions('appointment:write')
  checkIn(@Param('id') id: string) {
    return this.appointmentsService.checkIn(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }
}
