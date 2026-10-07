import { Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { StaffRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { TenantContextService } from '../prisma/tenant-context.service';
import { NotificationsService } from './notifications.service';

/**
 * Any authenticated staff member's own inbox — no permission slug, the
 * query itself is scoped to the caller. Patients use
 * /patients/me/notifications.
 */
@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('notifications')
  list(@Req() request: Request & { user: AuthenticatedUser }, @Query('unread') unread?: string) {
    const user = request.user;
    if (user.actorType !== 'USER') {
      throw new ForbiddenException('Patients use /patients/me/notifications.');
    }
    return this.notificationsService.listForStaff(
      this.tenantContext.organizationId,
      { userId: user.userId, role: user.role as unknown as StaffRole },
      unread === 'true',
    );
  }

  @Get('patients/me/notifications')
  listMine(
    @Req() request: Request & { user: AuthenticatedUser },
    @Query('unread') unread?: string,
  ) {
    const user = request.user;
    if (user.actorType !== 'PATIENT') {
      throw new ForbiddenException('Only a patient can access their own record this way.');
    }
    return this.notificationsService.listForPatient(
      user.organizationId,
      user.userId,
      unread === 'true',
    );
  }

  @Post('notifications/:id/read')
  markRead(@Req() request: Request & { user: AuthenticatedUser }, @Param('id') id: string) {
    const user = request.user;
    return this.notificationsService.markRead(
      this.tenantContext.organizationId,
      user.actorType === 'USER'
        ? { userId: user.userId, role: user.role as unknown as StaffRole }
        : { userId: user.userId, role: null, patientId: user.userId },
      id,
    );
  }
}
