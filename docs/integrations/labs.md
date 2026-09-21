# Lab Integration

Port: `apps/api/src/integrations/labs/lab-provider.interface.ts`
(`LabProvider`, token `LAB_PROVIDER`).
Current binding: `StubLabProvider` (logs, returns `PENDING`).

## Contract

```ts
submitOrder(input: SubmitLabOrderInput): Promise<{ externalOrderId: string }>;
fetchResult(externalOrderId: string): Promise<LabResultPayload>;
```

## Env vars

`LAB_API_URL` (`.env.example`).

## Manual result upload is not part of this interface

When a clinic's lab has no API, staff upload results manually inside the
`labs` domain module. That code path writes directly to the `LabResult`
model — it does not fake being a `LabProvider` implementation, per the
explicit instruction against generating fake integrations. See
`docs/workflows/lab.md`.
