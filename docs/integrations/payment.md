# Payment Integration

Port: `apps/api/src/integrations/payment/payment-provider.interface.ts`
(`PaymentProvider`, token `PAYMENT_PROVIDER`).
Current binding: `StubPaymentProvider` (logs, does not call a real gateway).

## Contract

```ts
createPaymentIntent(input: CreatePaymentInput): Promise<PaymentIntent>;
verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): VerifiedWebhookEvent;
refund(providerReferenceId: string, amountInPaise: number): Promise<{ refundId: string }>;
```

## Env vars

`PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET` (`.env.example`).

## Adding a real provider

1. Implement `PaymentProvider` in a new
   `<vendor>-payment-provider.ts` in this folder.
2. Update `integrations.module.ts`: `{ provide: PAYMENT_PROVIDER, useClass: <Vendor>PaymentProvider }`.
3. Never import the vendor SDK outside this file — `billing`/`payments`
   depend only on the `PaymentProvider` type.
4. Webhook endpoint (in `payments` module, not yet implemented) must call
   `verifyWebhookSignature` before trusting the payload — see
   `docs/workflows/billing.md`.
