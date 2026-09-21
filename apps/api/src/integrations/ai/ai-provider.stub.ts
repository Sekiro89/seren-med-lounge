import { Injectable, Logger } from '@nestjs/common';
import type {
  AiProvider,
  DraftClinicalNote,
  GenerateDraftNoteInput,
  TranscribeInput,
} from './ai-provider.interface';

/** Not production-ready. No AI provider (speech-to-text / LLM) is configured yet. */
@Injectable()
export class StubAiProvider implements AiProvider {
  private readonly logger = new Logger(StubAiProvider.name);

  async transcribe(input: TranscribeInput): Promise<{ transcript: string }> {
    this.logger.warn(`StubAiProvider: would transcribe ${input.audioObjectKey}`);
    return { transcript: '' };
  }

  async generateDraftNote(input: GenerateDraftNoteInput): Promise<DraftClinicalNote> {
    this.logger.warn(`StubAiProvider: would draft a note for encounter ${input.encounterId}`);
    return {};
  }
}
