import { BadRequestException, Get, Query, Body, Controller, Param, Post } from '@nestjs/common';
import {
  issueRefundSchema,
  recordPaymentSchema,
  type IssueRefundInput,
  type RecordPaymentInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { clinicDateString, clinicDayRange, isDateString } from '../common/clinic-time';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PaymentsService } from './payments.service';

/**
 * Recording a payment (payment:manage) and issuing a refund
 * (refund:issue) are separate permissions — both held by BILLING and
 * ADMINISTRATOR today. TODO(product): whether RECEPTION should be able
 * to take cash at the desk is undecided (open-questions.md#15), so it
 * isn't granted.
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (clinic-local, inclusive; default: today). */
  @Get('payments')
  @RequirePermissions('payment:manage')
  list(@Query('from') from?: string, @Query('to') to?: string) {
    const start = from ?? clinicDateString();
    const end = to ?? start;
    if (!isDateString(start) || !isDateString(end) || start > end) {
      throw new BadRequestException('from and to must be YYYY-MM-DD, from not after to.');
    }
    return this.paymentsService.list(this.tenantContext.organizationId, {
      from: clinicDayRange(start).from,
      to: clinicDayRange(end).to,
    });
  }

  @Post('invoices/:invoiceId/payments')
  @RequirePermissions('payment:manage')
  record(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.paymentsService.record(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      invoiceId,
      body,
    );
  }

  @Post('payments/:id/refunds')
  @RequirePermissions('refund:issue')
  refund(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(issueRefundSchema)) body: IssueRefundInput,
  ) {
    return this.paymentsService.refund(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      id,
      body,
    );
  }
}
