import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { clinicDateString, isDateString } from '../common/clinic-time';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ReportsService } from './reports.service';

const MAX_DAYS = 366;

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (clinic-local, inclusive; default: the last 30 days). */
  @Get('overview')
  @RequirePermissions('report:read')
  overview(@Query('from') from?: string, @Query('to') to?: string) {
    const end = to ?? clinicDateString();
    const start = from ?? clinicDateString(new Date(Date.now() - 29 * 86_400_000));
    if (!isDateString(start) || !isDateString(end)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD.');
    }
    if (start > end) {
      throw new BadRequestException('from must not be after to.');
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    if (days > MAX_DAYS) {
      throw new BadRequestException(`Choose a range of at most ${MAX_DAYS} days.`);
    }
    return this.reports.overview(this.tenantContext.organizationId, { from: start, to: end });
  }
}
