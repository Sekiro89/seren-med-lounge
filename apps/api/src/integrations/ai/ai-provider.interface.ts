export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface TranscribeInput {
  audioObjectKey: string;
}

export interface GenerateDraftNoteInput {
  transcript: string;
  encounterId: string;
}

export interface DraftClinicalNote {
  /** Always a draft — see docs/architecture/security.md. Never persisted as FINALIZED without doctor sign-off. */
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

/**
 * Port for the AI consultation assistant's model calls (speech-to-text +
 * draft-note generation). The `ai` domain module owns the consent →
 * recording → transcript → draft → doctor-review workflow; this interface
 * only wraps the model provider call itself. See
 * docs/workflows/doctor-consultation.md and docs/integrations/ai.md.
 *
 * SAFETY: nothing behind this interface may write to a clinical record.
 * Its only output is a draft that a doctor must review, edit, and sign off.
 */
export interface AiProvider {
  transcribe(input: TranscribeInput): Promise<{ transcript: string }>;
  generateDraftNote(input: GenerateDraftNoteInput): Promise<DraftClinicalNote>;
}
