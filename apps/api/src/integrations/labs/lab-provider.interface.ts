export const LAB_PROVIDER = Symbol('LAB_PROVIDER');

export interface SubmitLabOrderInput {
  patientExternalRef: string;
  testCodes: string[];
}

export interface LabResultPayload {
  externalOrderId: string;
  status: 'PENDING' | 'COMPLETED';
  reportUrl?: string;
  results?: Array<{ testCode: string; value: string; unit?: string; flag?: string }>;
}

/**
 * Port for external lab/diagnostics integration. The `labs` domain module
 * depends only on this interface — manual result upload (no external lab
 * API configured) is a separate code path inside `labs`, not a fake
 * implementation of this port. See docs/integrations/labs.md.
 */
export interface LabProvider {
  submitOrder(input: SubmitLabOrderInput): Promise<{ externalOrderId: string }>;
  fetchResult(externalOrderId: string): Promise<LabResultPayload>;
}
