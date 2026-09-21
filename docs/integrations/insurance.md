# Insurance Integration

Port: `apps/api/src/integrations/insurance/insurance-provider.interface.ts`
(`InsuranceProvider`, token `INSURANCE_PROVIDER`).
Current binding: `StubInsuranceProvider` (returns not-eligible; pre-auth throws).

## Contract

```ts
checkEligibility(input: EligibilityCheckInput): Promise<EligibilityResult>;
requestPreAuth(input: PreAuthRequestInput): Promise<{ preAuthReferenceId: string }>;
```

## Env vars

`INSURANCE_API_URL` (`.env.example`).

## Notes

Each insurer's API is different enough (and India has many TPAs/insurers
with bespoke integration requirements) that this interface intentionally
stays coarse. Claim submission and status polling are not yet part of
the contract — they get added when a specific insurer/TPA integration is
contracted, informed by that integration's real shape rather than a
guess. See `docs/workflows/insurance.md`.
