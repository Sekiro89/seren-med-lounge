import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createInvoiceSchema,
  voidInvoiceSchema,
  type CreateInvoiceInput,
  type VoidInvoiceInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('invoice:manage')
  list(@Query('patientId') patientId?: string) {
    return this.invoicesService.list(this.tenantContext.organizationId, { patientId });
  }

  @Get(':id')
  @RequirePermissions('invoice:manage')
  get(@Param('id') id: string) {
    return this.invoicesService.get(this.tenantContext.organizationId, id);
  }

  @Post()
  @RequirePermissions('invoice:manage')
  issue(@Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput) {
    return this.invoicesService.issue(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/void')
  @RequirePermissions('invoice:manage')
  void(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidInvoiceSchema)) body: VoidInvoiceInput,
  ) {
    return this.invoicesService.void(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
