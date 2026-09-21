export const INSURANCE_PROVIDER = Symbol('INSURANCE_PROVIDER');

export interface EligibilityCheckInput {
  policyNumber: string;
  insurerCode: string;
}

export interface EligibilityResult {
  eligible: boolean;
  coverageNotes?: string;
}

export interface PreAuthRequestInput {
  policyNumber: string;
  estimatedAmountInPaise: number;
  procedureCode: string;
}

/**
 * Port for insurer eligibility/pre-auth/claim integrations. The `insurance`
 * domain module depends only on this interface — each insurer's API
 * differs, so this stays intentionally coarse-grained. See
 * docs/integrations/insurance.md.
 */
export interface InsuranceProvider {
  checkEligibility(input: EligibilityCheckInput): Promise<EligibilityResult>;
  requestPreAuth(input: PreAuthRequestInput): Promise<{ preAuthReferenceId: string }>;
}
