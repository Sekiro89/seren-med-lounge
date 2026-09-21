# Doctor Consultation & the AI Assistant

The AI consultation assistant is **not a separate interface** — it is a
supporting capability inside this workflow, invoked from the doctor's
own consultation screen.

```
DOCTOR → CONSENT VERIFICATION → RECORDING → SPEECH-TO-TEXT → TRANSCRIPT
  → AI PROCESSING → DRAFT CLINICAL NOTE → DOCTOR REVIEW/EDIT
  → DOCTOR SIGN-OFF → FINAL CLINICAL RECORD
```

## Modules involved

- `ai` (domain module — owns this workflow's orchestration)
- `integrations/ai` (`AiProvider` port — see `docs/architecture/integrations.md`)
- `clinical-notes` (owns the draft → reviewed → finalized → amended
  lifecycle and the eventual `ClinicalNoteVersion` table)
- `patient-consent` (the consent-verification step reads/writes here)

## Non-negotiable safety rule

**AI must never directly create or finalize a clinical record.** Its
output — `DraftClinicalNote` in
`apps/api/src/integrations/ai/ai-provider.interface.ts` — is always a
draft. Only an explicit doctor sign-off action in `clinical-notes`
transitions a note into `FINALIZED` state. This is enforced
architecturally (the `ai` module has no write path to a finalized
record, only to a draft), not just by convention — see
`docs/architecture/security.md#ai-consultation-assistant--safety-boundary`.

## Versioning

Every doctor edit to an AI draft, and every later amendment to a
finalized note, produces a new version rather than overwriting history —
same rule as any other clinical record (`docs/architecture/security.md`).

## Status

`ai` module is a lean shell; `integrations/ai` has the interface and a
stub provider (`StubAiProvider`) that logs and returns empty output — no
real speech-to-text or LLM call is wired yet. `clinical-notes` has the
full controller/service/module pattern established but no persistence
logic yet (Prisma models for `ClinicalNote`/`ClinicalNoteVersion` are
proposed in `docs/database/erd.md`, not yet migrated).
