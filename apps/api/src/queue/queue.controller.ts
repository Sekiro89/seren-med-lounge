import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { QueueStation, QueueStatus } from '@prisma/client';
import { usesQueue } from '@serenemed/permissions';
import type { StaffRole } from '@serenemed/types';
import { moveQueueEntrySchema, type MoveQueueEntryInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TenantContextService } from '../prisma/tenant-context.service';
import { isDateString } from '../common/clinic-time';
import { QueueService } from './queue.service';

/**
 * The queue is open to every desk a token passes through, not only the
 * front desk: a role sees and works the stations it serves (see
 * STATION_PERMISSION in @serenemed/permissions), and `queue:manage` sees
 * the whole board. That rule depends on the token's current station, so
 * it is checked here and in QueueService rather than with a static
 * @RequirePermissions.
 */
@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?date=YYYY-MM-DD` (default: today, clinic-local), `&station=`, `&status=`. */
  @Get()
  list(
    @Query('date') date?: string,
    @Query('station') station?: string,
    @Query('status') status?: string,
  ) {
    const role = this.requireQueueRole();
    if (date && !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    if (station && !(station in QueueStation)) {
      throw new BadRequestException('Unknown station.');
    }
    if (status && !(status in QueueStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.queueService.list(this.tenantContext.organizationId, role, {
      date,
      station: station as QueueStation | undefined,
      status: status as QueueStatus | undefined,
    });
  }

  @Post(':id/call')
  call(@Param('id') id: string) {
    return this.act(id, 'call');
  }

  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.act(id, 'start');
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.act(id, 'complete');
  }

  @Post(':id/skip')
  skip(@Param('id') id: string) {
    return this.act(id, 'skip');
  }

  @Post(':id/move')
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveQueueEntrySchema)) body: MoveQueueEntryInput,
  ) {
    return this.queueService.move(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      this.requireQueueRole(),
      id,
      body.station,
    );
  }

  private act(id: string, action: 'call' | 'start' | 'complete' | 'skip') {
    return this.queueService.transition(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      this.requireQueueRole(),
      id,
      action,
    );
  }

  /** Staff only, and only roles that serve at least one station. */
  private requireQueueRole(): StaffRole {
    const role = this.tenantContext.staffRole;
    if (!role || !usesQueue(role)) {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }
    return role;
  }
}
