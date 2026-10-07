import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TaskStatus } from '@prisma/client';
import {
  createTaskSchema,
  setTaskStatusSchema,
  type CreateTaskInput,
  type SetTaskStatusInput,
} from '@serenemed/validation';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TenantContextService } from '../prisma/tenant-context.service';
import { TasksService } from './tasks.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

/**
 * Any authenticated staff user — no permission slug, every query is
 * scoped to the caller (assignee or creator). Patients get 403.
 */
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private staffId(request: AuthedRequest): string {
    if (request.user.actorType !== 'USER') {
      throw new ForbiddenException('Tasks are for staff only.');
    }
    return request.user.userId;
  }

  @Post()
  create(
    @Req() request: AuthedRequest,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ) {
    const actorId = this.staffId(request);
    return this.tasksService.create(this.tenantContext.organizationId, actorId, body);
  }

  /** `?mine=true` (default) | `?createdByMe=true`, `?status=`, `?due=today|overdue`. */
  @Get()
  list(
    @Req() request: AuthedRequest,
    @Query('createdByMe') createdByMe?: string,
    @Query('status') status?: string,
    @Query('due') due?: string,
  ) {
    const actorId = this.staffId(request);
    if (status && !(status in TaskStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    if (due && due !== 'today' && due !== 'overdue') {
      throw new BadRequestException('due must be today or overdue.');
    }
    return this.tasksService.list(this.tenantContext.organizationId, actorId, {
      createdByMe: createdByMe === 'true',
      status: status as TaskStatus | undefined,
      due: due as 'today' | 'overdue' | undefined,
    });
  }

  @Post(':id/status')
  setStatus(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTaskStatusSchema)) body: SetTaskStatusInput,
  ) {
    const actorId = this.staffId(request);
    return this.tasksService.setStatus(this.tenantContext.organizationId, actorId, id, body);
  }
}
