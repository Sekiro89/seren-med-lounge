import { Injectable, Logger } from '@nestjs/common';
import type {
  EligibilityCheckInput,
  EligibilityResult,
  InsuranceProvider,
} from './insurance-provider.interface';

/** Not production-ready. No insurer integrations are contracted yet. */
@Injectable()
export class StubInsuranceProvider implements InsuranceProvider {
  private readonly logger = new Logger(StubInsuranceProvider.name);

  async checkEligibility(input: EligibilityCheckInput): Promise<EligibilityResult> {
    this.logger.warn(`StubInsuranceProvider: would check eligibility for ${input.policyNumber}`);
    return { eligible: false, coverageNotes: 'No insurer integration configured.' };
  }

  async requestPreAuth(): Promise<{ preAuthReferenceId: string }> {
    throw new Error('StubInsuranceProvider cannot request pre-authorization.');
  }
}
