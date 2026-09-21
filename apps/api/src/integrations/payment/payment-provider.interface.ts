export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentInput {
  amountInPaise: number;
  currency: 'INR';
  invoiceId: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntent {
  providerReferenceId: string;
  status: 'CREATED' | 'PENDING';
  redirectUrl?: string;
}

export interface VerifiedWebhookEvent {
  providerReferenceId: string;
  status: 'SUCCEEDED' | 'FAILED';
  rawPayload: unknown;
}

/**
 * Port for the payment gateway. Concrete vendors (Razorpay, Stripe, etc.)
 * implement this and are swapped in `PaymentIntegrationModule` — the
 * `billing`/`payments` domain modules depend only on this interface, never
 * on a vendor SDK directly. See docs/integrations/payment.md.
 */
export interface PaymentProvider {
  createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): VerifiedWebhookEvent;
  refund(providerReferenceId: string, amountInPaise: number): Promise<{ refundId: string }>;
}
