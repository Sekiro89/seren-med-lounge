import { ApiError } from '@serenemed/api-client';
import type { Tone } from '../../../../lib/status';

export type CaseStatus =
  | 'ELIGIBILITY_CHECK'
  | 'PRE_AUTH_REQUESTED'
  | 'PRE_AUTH_APPROVED'
  | 'PRE_AUTH_DENIED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_PARTIALLY_APPROVED'
  | 'CLAIM_REJECTED'
  | 'SETTLED'
  | 'CLOSED';

export type TransitionTarget = Exclude<CaseStatus, 'ELIGIBILITY_CHECK' | 'SETTLED'>;

export interface PolicyRow {
  id: string;
  patientId: string;
  insurerName: string;
  tpaName: string | null;
  policyNumber: string;
  memberId: string | null;
  sumInsuredMinor: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

export interface CaseRow {
  id: string;
  status: CaseStatus;
  patientId: string;
  patient: { id: string; firstName: string; lastName: string };
  policy: { id: string; insurerName: string; tpaName: string | null; policyNumber: string };
  invoiceId: string | null;
  requestedAmountMinor: number | null;
  approvedAmountMinor: number | null;
  settledAmountMinor: number | null;
  preAuthReference: string | null;
  claimReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseEvent {
  id: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  amountMinor: number | null;
  note: string | null;
  createdAt: string;
  actor: { id: string; fullName: string };
}

export interface CaseDetail extends CaseRow {
  events: CaseEvent[];
}

export interface InvoiceOption {
  id: string;
  number: number;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  totalMinor: number;
  paidMinor: number;
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  ELIGIBILITY_CHECK: 'Eligibility check',
  PRE_AUTH_REQUESTED: 'Pre-auth requested',
  PRE_AUTH_APPROVED: 'Pre-auth approved',
  PRE_AUTH_DENIED: 'Pre-auth denied',
  CLAIM_SUBMITTED: 'Claim submitted',
  CLAIM_APPROVED: 'Claim approved',
  CLAIM_PARTIALLY_APPROVED: 'Partly approved',
  CLAIM_REJECTED: 'Claim rejected',
  SETTLED: 'Settled',
  CLOSED: 'Closed',
};

/** The one status-to-tone mapping for insurance cases. */
export const STATUS_TONE: Record<CaseStatus, Tone> = {
  ELIGIBILITY_CHECK: 'neutral',
  PRE_AUTH_REQUESTED: 'info',
  PRE_AUTH_APPROVED: 'success',
  PRE_AUTH_DENIED: 'danger',
  CLAIM_SUBMITTED: 'info',
  CLAIM_APPROVED: 'success',
  CLAIM_PARTIALLY_APPROVED: 'warning',
  CLAIM_REJECTED: 'danger',
  SETTLED: 'success',
  CLOSED: 'neutral',
};

export type Stage = 'eligibility' | 'preauth' | 'claims' | 'settled' | 'closed';

export const stageOf = (status: CaseStatus): Stage => {
  if (status === 'ELIGIBILITY_CHECK') return 'eligibility';
  if (status.startsWith('PRE_AUTH')) return 'preauth';
  if (status.startsWith('CLAIM')) return 'claims';
  return status === 'SETTLED' ? 'settled' : 'closed';
};

export interface NextStep {
  to: TransitionTarget;
  label: string;
  primary?: boolean;
  /** The server needs the insurer's approved amount for this step. */
  needsAmount?: boolean;
  /** Which reference the step records, if any. */
  reference?: string;
}

/** Valid moves through POST /transition. The server enforces the same table. */
export const NEXT_STEPS: Record<CaseStatus, NextStep[]> = {
  ELIGIBILITY_CHECK: [
    {
      to: 'PRE_AUTH_REQUESTED',
      label: 'Request pre-authorisation',
      primary: true,
      reference: 'Pre-auth reference',
    },
    { to: 'CLOSED', label: 'Close case' },
  ],
  PRE_AUTH_REQUESTED: [
    { to: 'PRE_AUTH_APPROVED', label: 'Record approval', primary: true, needsAmount: true },
    { to: 'PRE_AUTH_DENIED', label: 'Record denial' },
  ],
  PRE_AUTH_APPROVED: [
    { to: 'CLAIM_SUBMITTED', label: 'Submit claim', primary: true, reference: 'Claim reference' },
  ],
  PRE_AUTH_DENIED: [
    {
      to: 'PRE_AUTH_REQUESTED',
      label: 'Request again',
      primary: true,
      reference: 'Pre-auth reference',
    },
    { to: 'CLOSED', label: 'Close case' },
  ],
  CLAIM_SUBMITTED: [
    { to: 'CLAIM_APPROVED', label: 'Record approval', primary: true, needsAmount: true },
    { to: 'CLAIM_PARTIALLY_APPROVED', label: 'Record partial approval', needsAmount: true },
    { to: 'CLAIM_REJECTED', label: 'Record rejection' },
  ],
  CLAIM_APPROVED: [],
  CLAIM_PARTIALLY_APPROVED: [],
  CLAIM_REJECTED: [
    { to: 'CLAIM_SUBMITTED', label: 'Resubmit claim', primary: true, reference: 'Claim reference' },
    { to: 'CLOSED', label: 'Close case' },
  ],
  SETTLED: [{ to: 'CLOSED', label: 'Close case', primary: true }],
  CLOSED: [],
};

export const canSettle = (status: CaseStatus) =>
  status === 'CLAIM_APPROVED' || status === 'CLAIM_PARTIALLY_APPROVED';

export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

/** Server 4xx messages, without the internal "(N minor units)" suffix. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
    if (message && error.status >= 400 && error.status < 500) {
      return message.replace(/\s*\([^)]*minor units\)/, '');
    }
  }
  return fallback;
}

export const invoiceLabel = (number: number) => `INV-${String(number).padStart(6, '0')}`;

/** Whole rupees for a figure strip: `₹85,000` (the ledger keeps the paise). */
export const rupeeFigure = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(paise / 100));

/** A case still being worked: not settled and not closed. */
export const isOpenCase = (status: CaseStatus) => status !== 'SETTLED' && status !== 'CLOSED';

/** Waiting on the insurer's answer. */
export const awaitsInsurer = (status: CaseStatus) =>
  status === 'PRE_AUTH_REQUESTED' || status === 'CLAIM_SUBMITTED';
