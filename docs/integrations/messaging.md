# Messaging / WhatsApp Integration

Port: `apps/api/src/integrations/messaging/messaging-provider.interface.ts`
(`MessagingProvider`, token `MESSAGING_PROVIDER`).
Current binding: `StubMessagingProvider` (logs, sends nothing).

## Contract

```ts
send(input: SendMessageInput): Promise<{ messageId: string }>;
// SendMessageInput: { channel: 'EMAIL' | 'SMS' | 'WHATSAPP', to, templateId, variables }
```

## Env vars

`WHATSAPP_API_KEY`, `MESSAGING_API_KEY` (`.env.example`).

## How this is consumed

`notifications` (lean shell today) is the only module expected to call
this directly, in response to domain events (`AppointmentCreated`,
`PaymentCompleted`, `LabResultAvailable`, `FollowUpDue`, etc. — see
`docs/architecture/system-architecture.md`). Other modules publish
events; they don't call `MessagingProvider` themselves.

## Adding a real provider

Implement `MessagingProvider` per channel (or one class routing
internally by `channel`), bind it in `integrations.module.ts`. Template
management (`templateId` → actual copy) is expected to live with the
vendor integration, not hardcoded in `notifications`.
