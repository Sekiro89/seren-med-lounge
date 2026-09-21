# AI Consultation Assistant Integration

Port: `apps/api/src/integrations/ai/ai-provider.interface.ts`
(`AiProvider`, token `AI_PROVIDER`).
Current binding: `StubAiProvider` (logs, returns empty transcript/draft).

## Contract

```ts
transcribe(input: TranscribeInput): Promise<{ transcript: string }>;
generateDraftNote(input: GenerateDraftNoteInput): Promise<DraftClinicalNote>;
```

## Env vars

`AI_API_KEY` (`.env.example`).

## Safety boundary (repeated deliberately — this is the one that matters)

`DraftClinicalNote` is, and must remain, only ever a draft. Nothing
behind `AI_PROVIDER`, and nothing in the `ai` domain module that calls
it, may write a `FINALIZED` clinical record. See
`docs/architecture/security.md#ai-consultation-assistant--safety-boundary`
and `docs/workflows/doctor-consultation.md`.

## Adding a real provider

Implement `AiProvider` against a speech-to-text service and an LLM
(e.g. via the Claude API — see `docs/workflows/doctor-consultation.md`
for the full pipeline: consent → recording → transcript → draft →
doctor review → sign-off). Bind it in `integrations.module.ts`.
