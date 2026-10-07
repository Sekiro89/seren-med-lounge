import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createDoctorAvailabilitySchema,
  type CreateDoctorAvailabilityInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { isDateString } from '../common/clinic-time';
import { SchedulingService } from './scheduling.service';

/**
 * Doctor availability windows (writes: schedule:manage) and the slots
 * they produce (reads: appointment:read). A doctor's booked day is
 * GET /appointments?doctorId=&date= — not duplicated here.
 */
@Controller()
export class SchedulingController {
  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  @Post('doctor-availability')
  @RequirePermissions('schedule:manage')
  create(
    @Body(new ZodValidationPipe(createDoctorAvailabilitySchema))
    body: CreateDoctorAvailabilityInput,
  ) {
    return this.schedulingService.createAvailability(this.org, this.tenantContext.userId, body);
  }

  /** `?doctorId=`, `?includeInactive=true`. */
  @Get('doctor-availability')
  @RequirePermissions('appointment:read')
  list(@Query('doctorId') doctorId?: string, @Query('includeInactive') includeInactive?: string) {
    return this.schedulingService.listAvailability(this.org, {
      doctorId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('doctor-availability/:id/deactivate')
  @RequirePermissions('schedule:manage')
  deactivate(@Param('id') id: string) {
    return this.schedulingService.deactivateAvailability(this.org, this.tenantContext.userId, id);
  }

  @Get('doctors/:id/slots')
  @RequirePermissions('appointment:read')
  slots(@Param('id') doctorId: string, @Query('date') date?: string) {
    if (!date || !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    return this.schedulingService.slots(this.org, doctorId, date);
  }
}
