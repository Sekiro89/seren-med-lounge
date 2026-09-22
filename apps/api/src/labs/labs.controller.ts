import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  createLabOrderSchema,
  recordLabResultSchema,
  type CreateLabOrderInput,
  type RecordLabResultInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { LabsService } from './labs.service';

@Controller('lab-orders')
export class LabsController {
  constructor(
    private readonly labsService: LabsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get(':id')
  @RequirePermissions('patient-record:read-clinical')
  get(@Param('id') id: string) {
    return this.labsService.getOrder(this.tenantContext.organizationId, id);
  }

  @Post()
  @RequirePermissions('lab-order:write')
  create(@Body(new ZodValidationPipe(createLabOrderSchema)) body: CreateLabOrderInput) {
    return this.labsService.createOrder(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('lab-order:write')
  cancel(@Param('id') id: string) {
    return this.labsService.cancelOrder(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
    );
  }

  /**
   * A separate permission from the order itself (lab-result:write, not
   * lab-order:write) — today only ADMINISTRATOR has it (there's no lab
   * technician StaffRole yet), a real, documented gap rather than a
   * guessed-at role — see docs/architecture/security.md.
   */
  @Post('items/:itemId/results')
  @RequirePermissions('lab-result:write')
  recordResult(
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(recordLabResultSchema)) body: RecordLabResultInput,
  ) {
    return this.labsService.recordResult(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      itemId,
      body,
    );
  }
}
