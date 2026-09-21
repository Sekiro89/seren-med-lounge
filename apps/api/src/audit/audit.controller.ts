import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('audit-log:read')
  list() {
    return this.auditService.listForOrganization(this.tenantContext.organizationId);
  }
}
