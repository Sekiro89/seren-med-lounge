import { ApiError } from '@serenemed/api-client';

export interface InvoiceRow {
  id: string;
  number: number;
  patientId: string;
  patient: { id: string; firstName: string; lastName: string };
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  createdAt: string;
}

export interface RefundRow {
  id: string;
  amountMinor: number;
  reason: string;
  createdAt: string;
}

export interface PaymentRow {
  id: string;
  method: string;
  amountMinor: number;
  reference: string | null;
  createdAt: string;
  refunds: RefundRow[];
}

export interface InvoiceItemRow {
  id: string;
  itemType: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface InvoiceDetail extends InvoiceRow {
  notes: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  items: InvoiceItemRow[];
  payments: PaymentRow[];
}

export const invoiceLabel = (number: number) => `INV-${String(number).padStart(6, '0')}`;

export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

export const refundedOf = (payment: PaymentRow) =>
  payment.refunds.reduce((sum, r) => sum + r.amountMinor, 0);

/** Server 4xx messages, without the internal "(N minor units)" suffix. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
    if (message && error.status >= 400 && error.status < 500) {
      return message.replace(/\s*\([^)]*minor units\)/, '');
    }
  }
  return fallback;
}
