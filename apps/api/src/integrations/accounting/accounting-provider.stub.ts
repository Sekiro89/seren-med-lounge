import { Injectable, Logger } from '@nestjs/common';
import type { AccountingProvider, SyncInvoiceInput } from './accounting-provider.interface';

/** Not production-ready. Zoho OAuth/app setup is not configured yet. */
@Injectable()
export class StubAccountingProvider implements AccountingProvider {
  private readonly logger = new Logger(StubAccountingProvider.name);

  async syncInvoice(input: SyncInvoiceInput): Promise<{ externalInvoiceId: string }> {
    this.logger.warn(`StubAccountingProvider: would sync invoice ${input.invoiceId} to Zoho`);
    return { externalInvoiceId: `stub_${input.invoiceId}` };
  }

  async syncRefund(): Promise<void> {
    this.logger.warn('StubAccountingProvider: would sync refund to Zoho');
  }
}
