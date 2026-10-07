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

`invoices` and `payments` are implemented: `POST /invoices` (items in,
server-computed totals, per-org `number`), `GET /invoices[?patientId=]`,
`GET /invoices/:id`, `POST /invoices/:id/void`,
`POST /invoices/:invoiceId/payments` (CASH/UPI/CARD, staff-recorded),
`POST /payments/:id/refunds`, and patient-facing `GET /patients/me/invoices`.
Insurance settlement adds INSURANCE payments through
`PaymentsService.recordInTx` (see `insurance.md`). Covered by
`billing.e2e-spec.ts` and `insurance.e2e-spec.ts`. `billing` and
`accounting` remain lean shells; `integrations/payment` and
`integrations/accounting` still have only stub adapters, so there is no
online payment, webhook, or Zoho sync. Open decisions:
`docs/architecture/open-questions.md#15`.
