# Zoho / Accounting Integration

Port: `apps/api/src/integrations/accounting/accounting-provider.interface.ts`
(`AccountingProvider`, token `ACCOUNTING_PROVIDER`).
Current binding: `StubAccountingProvider` (logs, does not call Zoho).

## Contract

```ts
syncInvoice(input: SyncInvoiceInput): Promise<{ externalInvoiceId: string }>;
syncRefund(invoiceExternalId: string, amountInPaise: number): Promise<void>;
```

## Env vars

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (`.env.example`).

## Why the interface isn't named `ZohoProvider`

Per the explicit requirement not to tightly couple the core app to Zoho:
the interface is `AccountingProvider`. `billing`/`invoices` depend only
on this name. A future switch to a different accounting system means
adding `<vendor>-accounting-provider.ts` and changing one `useClass` in
`integrations.module.ts` — no change to `billing`/`invoices`.

## Adding the real Zoho adapter

1. Implement OAuth token refresh using `ZOHO_CLIENT_ID` /
   `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN`.
2. Implement `AccountingProvider` against the Zoho Books API.
3. Bind it in `integrations.module.ts`.
