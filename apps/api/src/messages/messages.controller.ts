import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MessageThreadStatus } from '@prisma/client';
import {
  assignMessageThreadSchema,
  createMessageThreadSchema,
  sendMessageSchema,
  type AssignMessageThreadInput,
  type CreateMessageThreadInput,
  type SendMessageInput,
} from '@serenemed/validation';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { requirePatient } from '../common/require-patient';
import { TenantContextService } from '../prisma/tenant-context.service';
import { MessagesService } from './messages.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

/**
 * Patient side under /patients/me/message-threads (own threads only —
 * the patient id always comes from the token). Staff side under
 * /message-threads, gated by message:manage.
 */
@Controller()
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  // ---------------------------------------------------------------- patient

  @Post('patients/me/message-threads')
  createMine(
    @Req() request: AuthedRequest,
    @Body(new ZodValidationPipe(createMessageThreadSchema)) body: CreateMessageThreadInput,
  ) {
    const patient = requirePatient(request);
    return this.messagesService.createThreadAsPatient(patient.organizationId, patient.userId, body);
  }

  @Get('patients/me/message-threads')
  listMine(@Req() request: AuthedRequest) {
    const patient = requirePatient(request);
    return this.messagesService.listForPatient(patient.organizationId, patient.userId);
  }

  @Get('patients/me/message-threads/:id')
  getMine(@Req() request: AuthedRequest, @Param('id') id: string) {
    const patient = requirePatient(request);
    return this.messagesService.getForPatient(patient.organizationId, patient.userId, id);
  }

  @Post('patients/me/message-threads/:id/messages')
  sendMine(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ) {
    const patient = requirePatient(request);
    return this.messagesService.sendAsPatient(patient.organizationId, patient.userId, id, body);
  }

  // ------------------------------------------------------------------ staff

  /** `?status=OPEN|CLOSED`, `?assignedToMe=true`. */
  @Get('message-threads')
  @RequirePermissions('message:manage')
  list(@Query('status') status?: string, @Query('assignedToMe') assignedToMe?: string) {
    if (status && !(status in MessageThreadStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.messagesService.listForStaff(this.org, this.tenantContext.userId, {
      status: status as MessageThreadStatus | undefined,
      assignedToMe: assignedToMe === 'true',
    });
  }

  @Get('message-threads/:id')
  @RequirePermissions('message:manage')
  get(@Param('id') id: string) {
    return this.messagesService.getForStaff(this.org, id);
  }

  @Post('message-threads/:id/messages')
  @RequirePermissions('message:manage')
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ) {
    return this.messagesService.sendAsStaff(this.org, this.tenantContext.userId, id, body);
  }

  @Post('message-threads/:id/assign')
  @RequirePermissions('message:manage')
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignMessageThreadSchema)) body: AssignMessageThreadInput,
  ) {
    return this.messagesService.assign(this.org, this.tenantContext.userId, id, body);
  }

  @Post('message-threads/:id/close')
  @RequirePermissions('message:manage')
  close(@Param('id') id: string) {
    return this.messagesService.close(this.org, this.tenantContext.userId, id);
  }

  @Post('message-threads/:id/reopen')
  @RequirePermissions('message:manage')
  reopen(@Param('id') id: string) {
    return this.messagesService.reopen(this.org, this.tenantContext.userId, id);
  }
}
