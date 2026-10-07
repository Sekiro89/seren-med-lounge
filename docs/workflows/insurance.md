# Insurance

Attaches directly to the Unified Patient Record — not a separate
disconnected system.

## Modules involved

`insurance` (domain module) + `integrations/insurance`
(`InsuranceProvider` port).

## Supported concepts (proposed — see `docs/database/erd.md`)

- Eligibility check
- Pre-authorization request/response
- Claim + claim stages (`InsuranceClaimStatus` in `@serenemed/types`:
  `ELIGIBILITY_CHECK → PRE_AUTH_REQUESTED → PRE_AUTH_APPROVED/DENIED →
CLAIM_SUBMITTED → CLAIM_APPROVED/PARTIALLY_APPROVED/REJECTED → SETTLED`)
- Insurance documents (stored in object storage, referenced by metadata)
- Insurance communication/history log

## Rules

- Each insurer's API differs significantly, so `InsuranceProvider` stays
  coarse-grained (eligibility + pre-auth today); claim
  submission/status-polling will extend the interface once a specific
  insurer integration is contracted, rather than guessing its shape now.
- Insurance-covered invoices route through this module before
  `billing`/`invoices` finalizes the payer-facing amount — see
  `billing.md`.

## Status

Implemented (`insurance` module; `insurance.e2e-spec.ts`): policies
(optionally linked to the INSURANCE_CARD document), cases against a
policy (optionally linked to encounter/procedure/invoice) moving through
the `InsuranceCaseStatus` state machine, an append-only event log for every
transition and every logged communication, and settlement that records a
`Payment` (method INSURANCE) on the linked invoice in the same transaction.
Every step is recorded manually by insurance staff — `InsuranceProvider`
is still a stub and is deliberately not called, so there's no real
eligibility check or claim submission.
