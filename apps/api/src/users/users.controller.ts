import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { StaffRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { createUserSchema, type CreateUserInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Declared before any `:id` style route. Any signed-in staff member (a
   * patient is refused); `?role=SENIOR_DOCTOR` narrows it.
   */
  @Get('directory')
  directory(@Req() request: Request & { user: AuthenticatedUser }, @Query('role') role?: string) {
    if (request.user.actorType !== 'USER') {
      throw new ForbiddenException('Staff only.');
    }
    if (role && !(role in StaffRole)) {
      throw new BadRequestException('Unknown role.');
    }
    return this.usersService.directory(
      this.tenantContext.organizationId,
      role as StaffRole | undefined,
    );
  }

  @Get()
  @RequirePermissions('user:manage')
  list() {
    return this.usersService.listForOrganization(this.tenantContext.organizationId);
  }

  @Post()
  @RequirePermissions('user:manage')
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput) {
    return this.usersService.create(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }
}
