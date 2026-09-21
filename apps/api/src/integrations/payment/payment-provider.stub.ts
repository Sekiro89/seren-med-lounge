import { Injectable, Logger } from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentIntent,
  PaymentProvider,
  VerifiedWebhookEvent,
} from './payment-provider.interface';

/**
 * Not production-ready. Placeholder adapter so the rest of the system can
 * be built and tested against the `PaymentProvider` port before a real
 * gateway (Razorpay/Stripe/etc.) is contracted and wired in.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(StubPaymentProvider.name);

  async createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent> {
    this.logger.warn('StubPaymentProvider in use — no real payment will be created.');
    return {
      providerReferenceId: `stub_${input.invoiceId}_${Date.now()}`,
      status: 'CREATED',
    };
  }

  verifyWebhookSignature(): VerifiedWebhookEvent {
    throw new Error('StubPaymentProvider cannot verify webhooks — configure a real provider.');
  }

  async refund(): Promise<{ refundId: string }> {
    throw new Error('StubPaymentProvider cannot process refunds — configure a real provider.');
  }
}
