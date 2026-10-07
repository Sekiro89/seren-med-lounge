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
import { StaffRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { UsersService } from './users.service';
import { toPrismaStaffRole } from './staff-role.mapper';

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

  /** Switch a staff member off or on, or change their role. */
  @Post(':id')
  @RequirePermissions('user:manage')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.usersService.update(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      {
        isActive: body.isActive,
        role: body.role ? toPrismaStaffRole(body.role) : undefined,
      },
    );
  }
}
