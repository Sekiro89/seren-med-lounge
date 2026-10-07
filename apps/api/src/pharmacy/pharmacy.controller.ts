import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DispensingStatus } from '@prisma/client';
import { createDispensingSchema, type CreateDispensingInput } from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PharmacyService } from './pharmacy.service';

@Controller()
export class PharmacyController {
  constructor(
    private readonly pharmacyService: PharmacyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?days=` look-back for prescriptions still waiting to be prepared (default 7). */
  @Get('pharmacy/pending')
  @RequirePermissions('pharmacy:dispense')
  pending(@Query('days') days?: string) {
    const n = days === undefined ? 7 : Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      throw new BadRequestException('days must be an integer between 1 and 365.');
    }
    return this.pharmacyService.listPending(this.tenantContext.organizationId, n);
  }

  @Get('dispensings')
  @RequirePermissions('pharmacy:dispense')
  list(@Query('patientId') patientId?: string, @Query('status') status?: string) {
    if (status && !(status in DispensingStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    return this.pharmacyService.list(this.tenantContext.organizationId, {
      patientId,
      status: status as DispensingStatus | undefined,
    });
  }

  @Post('dispensings')
  @RequirePermissions('pharmacy:dispense')
  dispense(@Body(new ZodValidationPipe(createDispensingSchema)) body: CreateDispensingInput) {
    return this.pharmacyService.dispense(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      body,
    );
  }

  @Post('dispensings/:id/hand-over')
  @RequirePermissions('pharmacy:dispense')
  handOver(@Param('id') id: string) {
    return this.act(id, 'hand-over');
  }

  @Post('dispensings/:id/dispatch')
  @RequirePermissions('pharmacy:dispense')
  dispatch(@Param('id') id: string) {
    return this.act(id, 'dispatch');
  }

  @Post('dispensings/:id/deliver')
  @RequirePermissions('pharmacy:dispense')
  deliver(@Param('id') id: string) {
    return this.act(id, 'deliver');
  }

  @Post('dispensings/:id/cancel')
  @RequirePermissions('pharmacy:dispense')
  cancel(@Param('id') id: string) {
    return this.act(id, 'cancel');
  }

  private act(id: string, action: 'hand-over' | 'dispatch' | 'deliver' | 'cancel') {
    return this.pharmacyService.transition(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      action,
    );
  }
}
