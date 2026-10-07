import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { InboxService } from './inbox.service';

@Controller('inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  /**
   * Any staff user. No @RequirePermissions(): what each list contains is
   * narrowed by role inside InboxService (a billing user simply gets
   * empty lists). Patients are refused outright.
   */
  @Get()
  get(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = request.user;
    if (user.actorType !== 'USER') {
      throw new ForbiddenException('The inbox is for staff only.');
    }
    return this.inboxService.forUser(user.organizationId, user.userId, user.role);
  }
}
