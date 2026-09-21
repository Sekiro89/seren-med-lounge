export const ACCOUNTING_PROVIDER = Symbol('ACCOUNTING_PROVIDER');

export interface SyncInvoiceInput {
  invoiceId: string;
  totalInPaise: number;
  gstAmountInPaise: number;
  patientDisplayName: string;
}

/**
 * Port for accounting sync (Zoho Books today, potentially another provider
 * later). The `accounting` domain module — and nothing else — depends on
 * this interface, so Zoho never leaks into billing/invoices business
 * logic. See docs/integrations/zoho.md.
 */
export interface AccountingProvider {
  syncInvoice(input: SyncInvoiceInput): Promise<{ externalInvoiceId: string }>;
  syncRefund(invoiceExternalId: string, amountInPaise: number): Promise<void>;
}
