# Integrations

Every external service sits behind an interface in
`apps/api/src/integrations/<service>/`. A domain module injects the
interface's DI token — never a vendor SDK, never a concrete `Stub*` class.

```
apps/api/src/integrations/
  payment/      PaymentProvider      (PAYMENT_PROVIDER)
  messaging/    MessagingProvider    (MESSAGING_PROVIDER)
  labs/         LabProvider          (LAB_PROVIDER)
  insurance/    InsuranceProvider    (INSURANCE_PROVIDER)
  accounting/   AccountingProvider   (ACCOUNTING_PROVIDER)
  video/        VideoProvider        (VIDEO_PROVIDER)
  ai/           AiProvider           (AI_PROVIDER)
  integrations.module.ts   ← binds every token to its Stub* implementation
```

## Current state: every binding is a stub

`IntegrationsModule` binds each token to a `Stub*` class today. Every
stub logs a warning and either returns an inert placeholder or throws —
none of them call a real vendor API. This is deliberate: it lets every
other module (billing, notifications, labs, insurance, accounting, ai)
be built and tested against the real interface shape before a vendor
contract exists, without pretending a fake integration is production-ready.

Swapping in a real vendor is a one-line change in
`integrations.module.ts` (`useClass: StubPaymentProvider` →
`useClass: RazorpayPaymentProvider`, for example) — nothing in the domain
modules changes, because they only ever depended on the interface.

## Per-service notes

- **Payment** (`payment/`) — gateway-agnostic port: create intent, verify
  webhook signature, refund. See `docs/workflows/billing.md` and
  `docs/integrations/payment.md`.
- **Messaging / WhatsApp** (`messaging/`) — single `send()` across
  EMAIL/SMS/WHATSAPP channels; `notifications` module decides which
  channel per event. See `docs/integrations/messaging.md`.
- **Labs** (`labs/`) — submit order / fetch result. Manual result upload
  (no external lab API) is a separate code path inside the `labs` domain
  module, not a fake implementation of this port. See
  `docs/integrations/labs.md`.
- **Insurance** (`insurance/`) — eligibility + pre-auth request. Claim
  submission/status-tracking will extend this interface once an insurer
  is contracted. See `docs/integrations/insurance.md`.
- **Accounting / Zoho** (`accounting/`) — invoice/refund sync. Named
  generically (`AccountingProvider`, not `ZohoProvider`) specifically so
  a different accounting system can be substituted later without
  touching `billing`/`invoices`. See `docs/integrations/zoho.md`.
- **Video consultation** (`video/`) — room creation/teardown for the
  video-consultation entry point in the clinic journey. See
  `docs/workflows/clinic-journey.md`.
- **AI consultation assistant** (`ai/`) — transcription + draft-note
  generation only. Safety boundary (draft-only, never finalizes a
  record) is documented in `security.md` and `docs/integrations/ai.md`.
