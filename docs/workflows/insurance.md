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

`insurance` is a lean module shell. `integrations/insurance` has the
interface and a stub provider (`StubInsuranceProvider`) — no insurer is
contracted yet.
