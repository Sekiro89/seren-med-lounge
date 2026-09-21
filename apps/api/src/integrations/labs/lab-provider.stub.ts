import { Injectable, Logger } from '@nestjs/common';
import type { LabProvider, LabResultPayload, SubmitLabOrderInput } from './lab-provider.interface';

/** Not production-ready. No external lab API is configured yet — see lab-provider.interface.ts. */
@Injectable()
export class StubLabProvider implements LabProvider {
  private readonly logger = new Logger(StubLabProvider.name);

  async submitOrder(input: SubmitLabOrderInput): Promise<{ externalOrderId: string }> {
    this.logger.warn(`StubLabProvider: would submit order for ${input.patientExternalRef}`);
    return { externalOrderId: `stub_${Date.now()}` };
  }

  async fetchResult(externalOrderId: string): Promise<LabResultPayload> {
    return { externalOrderId, status: 'PENDING' };
  }
}
