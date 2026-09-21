import { Body, Controller, Get, Post } from '@nestjs/common';
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
