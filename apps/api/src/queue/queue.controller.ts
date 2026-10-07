import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { QueueStation, QueueStatus } from '@prisma/client';
import { moveQueueEntrySchema, type MoveQueueEntryInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { isDateString } from '../common/clinic-time';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?date=YYYY-MM-DD` (default: today, clinic-local), `&station=`, `&status=`. */
  @Get()
  @RequirePermissions('queue:manage')
  list(
    @Query('date') date?: string,
    @Query('station') station?: string,
    @Query('status') status?: string,
  ) {
    if (date && !isDateString(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD.');
    }
    if (station && !(station in QueueStation)) {
      throw new BadRequestException('Unknown station.');
    }
    if (status && !(status in QueueStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.queueService.list(this.tenantContext.organizationId, {
      date,
      station: station as QueueStation | undefined,
      status: status as QueueStatus | undefined,
    });
  }

  @Post(':id/call')
  @RequirePermissions('queue:manage')
  call(@Param('id') id: string) {
    return this.act(id, 'call');
  }

  @Post(':id/start')
  @RequirePermissions('queue:manage')
  start(@Param('id') id: string) {
    return this.act(id, 'start');
  }

  @Post(':id/complete')
  @RequirePermissions('queue:manage')
  complete(@Param('id') id: string) {
    return this.act(id, 'complete');
  }

  @Post(':id/skip')
  @RequirePermissions('queue:manage')
  skip(@Param('id') id: string) {
    return this.act(id, 'skip');
  }

  @Post(':id/move')
  @RequirePermissions('queue:manage')
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveQueueEntrySchema)) body: MoveQueueEntryInput,
  ) {
    return this.queueService.move(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body.station,
    );
  }

  private act(id: string, action: 'call' | 'start' | 'complete' | 'skip') {
    return this.queueService.transition(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      action,
    );
  }
}
