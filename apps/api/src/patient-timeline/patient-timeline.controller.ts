import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { requirePatient } from '../common/require-patient';
import { TenantContextService } from '../prisma/tenant-context.service';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { PatientTimelineService } from './patient-timeline.service';

@Controller()
export class PatientTimelineController {
  constructor(
    private readonly timeline: PatientTimelineService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // The patient route is declared first so `me` is never read as a patient id.
  /** Patient: their own record, signed-off entries only. */
  @Get('patients/me/timeline')
  forPatient(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = requirePatient(request);
    return this.timeline.forPatient(user.organizationId, user.userId);
  }

  /** Staff: the whole record in order, drafts and staff-only rows included. */
  @Get('patients/:id/timeline')
  @RequirePermissions('patient-record:read-clinical')
  forStaff(@Param('id') id: string) {
    return this.timeline.forStaff(this.tenantContext.organizationId, id);
  }
}
