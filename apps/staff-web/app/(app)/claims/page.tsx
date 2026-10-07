'use client';

import { useState } from 'react';
import { IdentificationCard } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Dialog } from '../../../components/ui/dialog';
import { EmptyState } from '../../../components/ui/empty-state';
import { Input } from '../../../components/ui/fields';
import { Figures, InkSection, InkSheet, SheetHead } from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import { apiClient } from '../../../lib/api-client';
import { formatDate, formatTime, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';

interface CandidatePatient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

interface ClaimRow {
  id: string;
  source: 'SELF_SIGNUP' | 'RECEPTION_INTAKE';
  matchReason: string;
  status: 'PENDING' | 'ESCALATED';
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  createdAt: string;
  candidates: CandidatePatient[];
}

const MATCH_REASON_LABEL: Record<string, string> = {
  phone_dob_lastname_mismatch: 'Phone and date of birth matched, name did not',
  phone_dob_multiple: 'Multiple records share this phone and date of birth',
  phone_dob_all_claimed: 'Matching record(s) already have an account',
  name_dob_different_phone: 'Name and date of birth matched, phone did not',
  name_dob_different_phone_multiple: 'Multiple records share this name and date of birth',
  legacy_unspecified: 'Unspecified (created before this field existed)',
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (typeof body === 'object' && body && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
    return fallback;
  }
  return 'Could not reach the server. Please try again.';
}

type Person = Pick<CandidatePatient, 'firstName' | 'lastName' | 'dateOfBirth' | 'phone' | 'email'>;

const digits = (v: string) => v.replace(/\D/g, '').slice(-10);

/** The identifiers compared side by side, with how to tell if two values agree. */
const FIELDS: Array<{
  label: string;
  value: (p: Person) => string;
  same: (a: Person, b: Person) => boolean;
  mono?: boolean;
}> = [
  {
    label: 'Name',
    value: (p) => fullName(p),
    same: (a, b) => fullName(a).trim().toLowerCase() === fullName(b).trim().toLowerCase(),
  },
  {
    label: 'Date of birth',
    value: (p) => formatDate(p.dateOfBirth),
    same: (a, b) => a.dateOfBirth.slice(0, 10) === b.dateOfBirth.slice(0, 10),
    mono: true,
  },
  {
    label: 'Phone',
    value: (p) => p.phone,
    same: (a, b) => digits(a.phone) === digits(b.phone),
    mono: true,
  },
  {
    label: 'Email',
    value: (p) => p.email ?? 'None',
    same: (a, b) => (a.email ?? '').toLowerCase() === (b.email ?? '').toLowerCase(),
  },
];

/**
 * Patient Record Claim Rules (docs/architecture/open-questions.md#3):
 * every self-signup PatientsService.selfRegister could not confidently
 * resolve lands here as a PENDING PatientClaimRequest, with the candidate
 * Patient record(s) shown side by side so a reviewer can link to an
 * existing record (never creating a duplicate), create a genuinely new
 * record, or reject when identity cannot be established.
 */
export default function ClaimsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'patient:write');
  const {
    data: claims,
    loading,
    errorStatus,
    reload,
  } = useApi<ClaimRow[]>(allowed ? '/patient-claims' : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);
  const [reasonByClaim, setReasonByClaim] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<ClaimRow | null>(null);

  const run = async (claimId: string, action: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    setBusyClaimId(claimId);
    try {
      await action();
      reload();
    } catch (error) {
      setActionError(errorMessage(error, fallback));
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleLink = (claimId: string, patientId: string) =>
    run(
      claimId,
      () => apiClient.post(`/patient-claims/${claimId}/link`, { patientId }),
      'Could not link this claim.',
    );

  const handleCreateNew = (claimId: string) =>
    run(
      claimId,
      () => apiClient.post(`/patient-claims/${claimId}/create-new`),
      'Could not create a new record for this claim.',
    );

  const handleReject = async (claim: ClaimRow) => {
    const reason = reasonByClaim[claim.id]?.trim() || undefined;
    setRejecting(null);
    await run(
      claim.id,
      () => apiClient.post(`/patient-claims/${claim.id}/reject`, { reason }),
      'Could not reject this claim.',
    );
  };

  const handleEscalate = (claimId: string) => {
    const reason = reasonByClaim[claimId]?.trim() || undefined;
    return run(
      claimId,
      () => apiClient.post(`/patient-claims/${claimId}/escalate`, { reason }),
      'Could not escalate this claim.',
    );
  };

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const escalated = claims?.filter((c) => c.status === 'ESCALATED').length;

  return (
    <>
      {actionError && (
        <p role="alert" className="mb-4 bg-danger-bg px-4 py-2.5 text-sm text-danger-fg">
          {actionError}
        </p>
      )}

      <InkSheet>
        <SheetHead
          title="Patient claims"
          description="Signups and Reception intake attempts that could not be matched to an existing record on their own."
          figures={
            <Figures
              loading={loading && !claims}
              items={[
                { label: 'To review', value: claims?.length },
                {
                  label: 'Escalated',
                  value: escalated,
                  tone: escalated ? 'warning' : undefined,
                },
                {
                  label: 'From signup',
                  value: claims?.filter((c) => c.source === 'SELF_SIGNUP').length,
                },
              ]}
            />
          }
        />

        <div className="flex flex-col gap-10 px-5 pb-8 pt-6 sm:px-8">
          {loading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
          )}

          {!loading && errorStatus !== undefined && !claims && (
            <div role="alert" className="flex items-center justify-between gap-4">
              <p className="text-sm text-danger-fg">Could not load pending claims.</p>
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            </div>
          )}

          {claims && claims.length === 0 && (
            <EmptyState
              icon={IdentificationCard}
              title="No pending claims"
              description="Signups that need a human decision will appear here."
            />
          )}

          {claims?.map((claim, index) => {
            const busy = busyClaimId === claim.id;
            return (
              <InkSection
                key={claim.id}
                id={`claim-${claim.id}`}
                number={index + 1}
                title={fullName(claim)}
                meta={
                  <>
                    {claim.source === 'SELF_SIGNUP' ? 'Patient signup' : 'Reception intake'} ·{' '}
                    <span className="tabular font-mono">
                      {formatDate(claim.createdAt)} {formatTime(claim.createdAt)}
                    </span>
                  </>
                }
                action={
                  claim.status === 'ESCALATED' ? <Badge tone="warning">Escalated</Badge> : undefined
                }
              >
                <p className="mt-1 text-[13px] text-fg-muted">
                  {MATCH_REASON_LABEL[claim.matchReason] ?? claim.matchReason}. Values that differ
                  from what was submitted are marked.
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                    <caption className="sr-only">
                      Submitted details compared with candidate records
                    </caption>
                    <thead>
                      <tr className="h-9 border-b border-line text-[11px] text-fg-muted">
                        <th scope="col" className="w-[120px] pr-3 font-medium">
                          <span className="sr-only">Field</span>
                        </th>
                        <th scope="col" className="pr-3 font-medium">
                          {claim.source === 'SELF_SIGNUP'
                            ? 'Submitted at signup'
                            : 'Submitted by Reception'}
                        </th>
                        {claim.candidates.map((c, i) => (
                          <th
                            key={c.id}
                            scope="col"
                            className="border-l border-line px-3 font-medium"
                          >
                            Candidate record {claim.candidates.length > 1 ? i + 1 : ''}
                          </th>
                        ))}
                        {claim.candidates.length === 0 && (
                          <th scope="col" className="border-l border-line px-3 font-medium">
                            Candidates
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map((f) => (
                        <tr key={f.label} className="h-10 border-b border-line">
                          <th scope="row" className="pr-3 font-normal text-fg-muted">
                            {f.label}
                          </th>
                          <td className={`pr-3 text-fg ${f.mono ? 'tabular font-mono' : ''}`}>
                            {f.value(claim)}
                          </td>
                          {claim.candidates.map((c) => {
                            const same = f.same(claim, c);
                            return (
                              <td
                                key={c.id}
                                className={`border-l border-line px-3 ${
                                  same ? 'text-fg' : 'bg-warning-bg font-medium text-warning-fg'
                                } ${f.mono ? 'tabular font-mono' : ''}`}
                              >
                                {f.value(c)}
                                {!same && <span className="sr-only"> (differs)</span>}
                              </td>
                            );
                          })}
                          {claim.candidates.length === 0 && (
                            <td className="border-l border-line px-3 text-fg-muted">
                              {f.label === 'Name' ? 'No candidates flagged.' : ''}
                            </td>
                          )}
                        </tr>
                      ))}
                      {claim.candidates.length > 0 && (
                        <tr>
                          <td />
                          <td />
                          {claim.candidates.map((candidate) => (
                            <td key={candidate.id} className="border-l border-line px-3 py-3">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() => handleLink(claim.id, candidate.id)}
                              >
                                {claim.source === 'SELF_SIGNUP'
                                  ? 'Link to this record'
                                  : 'Confirm same patient'}
                              </Button>
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleCreateNew(claim.id)}
                  >
                    None of these, create new record
                  </Button>
                  <label htmlFor={`reason-${claim.id}`} className="sr-only">
                    Reason (optional)
                  </label>
                  <Input
                    id={`reason-${claim.id}`}
                    className="min-w-[12rem] flex-1"
                    placeholder="Reason, optional"
                    value={reasonByClaim[claim.id] ?? ''}
                    onChange={(event) =>
                      setReasonByClaim((prev) => ({ ...prev, [claim.id]: event.target.value }))
                    }
                  />
                  {claim.status === 'PENDING' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      onClick={() => handleEscalate(claim.id)}
                    >
                      Escalate
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => setRejecting(claim)}
                  >
                    Reject
                  </Button>
                </div>
              </InkSection>
            );
          })}
        </div>
      </InkSheet>

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject claim"
        description={rejecting ? `Claim from ${fullName(rejecting)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Keep claim
            </Button>
            <Button variant="danger" onClick={() => rejecting && handleReject(rejecting)}>
              Reject claim
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          Rejecting means this identity could not be established and no record will be linked or
          created. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
