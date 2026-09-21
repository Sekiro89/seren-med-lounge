import { Injectable, Logger } from '@nestjs/common';
import type { MessagingProvider, SendMessageInput } from './messaging-provider.interface';

/** Not production-ready. Logs instead of sending — see payment-provider.stub.ts for the pattern. */
@Injectable()
export class StubMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(StubMessagingProvider.name);

  async send(input: SendMessageInput): Promise<{ messageId: string }> {
    this.logger.warn(
      `StubMessagingProvider: would send ${input.channel} to ${input.to} (template=${input.templateId})`,
    );
    return { messageId: `stub_${Date.now()}` };
  }
}
