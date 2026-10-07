import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { setClinicHoursSchema, type SetClinicHoursInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ClinicHoursService } from './clinic-hours.service';

/**
 * Clinic opening hours. Any signed-in staff member may read them (the
 * "open now" chip in the staff header); only `schedule:manage` may
 * change them. Patients get a 403.
 */
@Controller('clinic/hours')
export class ClinicHoursController {
  constructor(
    private readonly clinicHoursService: ClinicHoursService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `{ isOpen, opensAt, closesAt }` for today, clinic time. */
  @Get('today')
  today() {
    return this.clinicHoursService.today(this.staffOrg());
  }

  /** Seven entries, Sunday (0) first: `{ dayOfWeek, opensAt, closesAt }`, null times = closed. */
  @Get()
  week() {
    return this.clinicHoursService.week(this.staffOrg());
  }

  @Put()
  @RequirePermissions('schedule:manage')
  replace(@Body(new ZodValidationPipe(setClinicHoursSchema)) body: SetClinicHoursInput) {
    return this.clinicHoursService.replaceWeek(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  private staffOrg(): string {
    if (!this.tenantContext.staffRole) {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }
    return this.tenantContext.organizationId;
  }
}
