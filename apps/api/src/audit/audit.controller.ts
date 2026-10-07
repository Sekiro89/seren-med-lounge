import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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

  /**
   * `?action=invoice.` (prefix), `&entityType=`, `&actorId=`, `&before=<ISO
   * time of the last row you have>`, `&limit=` (default 50, max 200).
   */
  @Get('search')
  @RequirePermissions('audit-log:read')
  search(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      throw new BadRequestException('limit must be a whole number from 1 to 200.');
    }
    const cursor = before ? new Date(before) : undefined;
    if (cursor && Number.isNaN(cursor.getTime())) {
      throw new BadRequestException('before must be a valid date-time.');
    }
    return this.auditService.search(this.tenantContext.organizationId, {
      action,
      entityType,
      actorId,
      before: cursor,
      limit: n,
    });
  }
}
