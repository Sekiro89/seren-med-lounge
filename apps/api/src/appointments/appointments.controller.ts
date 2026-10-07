import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { createAppointmentSchema, type CreateAppointmentInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { AppointmentsService } from './appointments.service';
import { clinicDayRange, isDateString } from '../common/clinic-time';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * `?doctorId=&date=YYYY-MM-DD` gives one doctor's daily calendar (the
   * command centre's "doctor daily calendar"); both are optional. The
   * day boundary is UTC — TODO(product): clinic timezone, see
   * open-questions.md#16.
   */
  @Get()
  @RequirePermissions('appointment:read')
  list(@Query('doctorId') doctorId?: string, @Query('date') date?: string) {
    if (date && !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    return this.appointmentsService.listForOrganization(this.tenantContext.organizationId, {
      doctorId,
      ...(date ? clinicDayRange(date) : {}),
    });
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
