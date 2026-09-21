# Billing / Payments

```
PATIENT/STAFF → BACKEND → PAYMENT PROVIDER → PAYMENT WEBHOOK
  → BACKEND → PAYMENT RECORD → INVOICE STATUS → PATIENT RECORD
```

## Modules involved

`billing`, `invoices`, `payments`, `insurance`, `accounting`, plus
`integrations/payment` (`PaymentProvider` port) and
`integrations/accounting` (`AccountingProvider` port).

## Rules

- Payment provider logic lives **only** behind `PaymentProvider` — never
  inside a controller, service business logic, or any UI component. See
  `docs/architecture/integrations.md`.
- Supported methods (`PaymentMethod` in `@serenemed/types`): `CASH`,
  `UPI`, `CARD`, `CREDIT`, `INSURANCE`, `SPLIT`.
- Webhook verification (`PaymentProvider.verifyWebhookSignature`) is
  mandatory before a webhook is trusted to update payment/invoice status
  — a payment is never marked `SUCCEEDED` from an unverified callback.
- A `Refund` is a distinct record from `Payment`, not a negative payment
  row, so refund history and original payment history stay separately
  auditable.
- Insurance-covered invoices route through `insurance` for
  eligibility/pre-auth (`docs/workflows/insurance.md`) before the invoice
  is finalized against the payer.

## Status

`billing`/`invoices`/`payments`/`insurance`/`accounting` are lean module
shells. `integrations/payment` and `integrations/accounting` have
interface + stub adapter (`StubPaymentProvider`, `StubAccountingProvider`)
— both log and refuse real work, since no gateway/Zoho app is contracted
yet.
