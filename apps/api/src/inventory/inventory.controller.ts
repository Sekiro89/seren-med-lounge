import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  adjustStockSchema,
  createMedicationSchema,
  receiveStockSchema,
  type AdjustStockInput,
  type CreateMedicationInput,
  type ReceiveStockInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { InventoryService } from './inventory.service';

/**
 * Catalogue reads are open to pharmacy:dispense too (the dispensing desk
 * needs to pick a medication); every write is inventory:manage.
 */
@Controller()
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('medications')
  @RequirePermissions('pharmacy:dispense')
  listMedications(@Query('search') search?: string) {
    return this.inventoryService.listMedications(this.tenantContext.organizationId, search);
  }

  @Post('medications')
  @RequirePermissions('inventory:manage')
  createMedication(
    @Body(new ZodValidationPipe(createMedicationSchema)) body: CreateMedicationInput,
  ) {
    return this.inventoryService.createMedication(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post('medications/:id/deactivate')
  @RequirePermissions('inventory:manage')
  deactivate(@Param('id') id: string) {
    return this.inventoryService.setMedicationActive(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      false,
    );
  }

  @Post('medications/:id/activate')
  @RequirePermissions('inventory:manage')
  activate(@Param('id') id: string) {
    return this.inventoryService.setMedicationActive(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      true,
    );
  }

  @Get('stock/batches')
  @RequirePermissions('pharmacy:dispense')
  listBatches(@Query('medicationId') medicationId?: string) {
    return this.inventoryService.listBatches(this.tenantContext.organizationId, medicationId);
  }

  @Post('stock/batches')
  @RequirePermissions('inventory:manage')
  receive(@Body(new ZodValidationPipe(receiveStockSchema)) body: ReceiveStockInput) {
    return this.inventoryService.receiveStock(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post('stock/batches/:id/adjust')
  @RequirePermissions('inventory:manage')
  adjust(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockInput,
  ) {
    return this.inventoryService.adjustStock(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }

  @Get('stock/expiring')
  @RequirePermissions('inventory:manage')
  expiring(@Query('days') days?: string) {
    const n = days === undefined ? 30 : Number(days);
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      throw new BadRequestException('days must be an integer between 0 and 3650.');
    }
    return this.inventoryService.listExpiring(this.tenantContext.organizationId, n);
  }

  @Get('stock/low')
  @RequirePermissions('inventory:manage')
  low() {
    return this.inventoryService.listLowStock(this.tenantContext.organizationId);
  }

  @Get('stock/movements')
  @RequirePermissions('inventory:manage')
  movements(@Query('medicationId') medicationId?: string, @Query('batchId') batchId?: string) {
    return this.inventoryService.listMovements(this.tenantContext.organizationId, {
      medicationId,
      batchId,
    });
  }
}
