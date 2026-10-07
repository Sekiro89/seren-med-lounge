import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuditModule, InvoicesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
