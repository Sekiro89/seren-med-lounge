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
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">{children}</h3>
  );
}

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

  return (
    <>
      <PageHeader
        title="Patient claims"
        description="Patient signups and Reception intake attempts that could not be confidently matched to an existing record on their own."
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg"
        >
          {actionError}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {loading && (
          <Card className="p-5">
            <Skeleton className="mb-3 h-5 w-48" />
            <Skeleton className="mb-2 h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </Card>
        )}

        {!loading && errorStatus !== undefined && !claims && (
          <Card>
            <div role="alert" className="flex items-center justify-between gap-4 p-5">
              <p className="text-sm text-danger-fg">Could not load pending claims.</p>
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            </div>
          </Card>
        )}

        {claims && claims.length === 0 && (
          <Card>
            <EmptyState
              icon={IdentificationCard}
              title="No pending claims"
              description="Signups that need a human decision will appear here."
            />
          </Card>
        )}

        {claims?.map((claim) => {
          const busy = busyClaimId === claim.id;
          return (
            <Card key={claim.id} className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge>
                  {claim.source === 'SELF_SIGNUP' ? 'Patient signup' : 'Reception intake'}
                </Badge>
                {claim.status === 'ESCALATED' && <Badge tone="warning">Escalated</Badge>}
                <span className="text-[13px] text-fg-muted">
                  {MATCH_REASON_LABEL[claim.matchReason] ?? claim.matchReason}
                </span>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <SectionLabel>
                    {claim.source === 'SELF_SIGNUP'
                      ? 'Submitted at signup'
                      : 'Submitted by Reception'}
                  </SectionLabel>
                  <p className="text-sm font-medium text-fg">{fullName(claim)}</p>
                  <p className="text-sm text-fg-muted">
                    Date of birth {formatDate(claim.dateOfBirth)}
                  </p>
                  <p className="text-sm text-fg-muted">{claim.phone}</p>
                  <p className="text-sm text-fg-muted">{claim.email ?? 'No email provided'}</p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    Requested {formatDate(claim.createdAt)} {formatTime(claim.createdAt)}
                  </p>
                </div>
                <div>
                  <SectionLabel>
                    Candidate record{claim.candidates.length === 1 ? '' : 's'}
                  </SectionLabel>
                  {claim.candidates.length === 0 ? (
                    <p className="text-sm text-fg-muted">No candidates flagged.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {claim.candidates.map((candidate) => (
                        <li
                          key={candidate.id}
                          className="rounded-control border border-line p-3 text-sm"
                        >
                          <p className="font-medium text-fg">{fullName(candidate)}</p>
                          <p className="text-fg-muted">
                            Date of birth {formatDate(candidate.dateOfBirth)}
                          </p>
                          <p className="text-fg-muted">{candidate.phone}</p>
                          <p className="text-fg-muted">{candidate.email ?? 'No email on file'}</p>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                            disabled={busy}
                            onClick={() => handleLink(claim.id, candidate.id)}
                          >
                            {claim.source === 'SELF_SIGNUP'
                              ? 'Link to this record'
                              : 'Confirm same patient'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button
                  variant="secondary"
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
                <Button variant="danger" disabled={busy} onClick={() => setRejecting(claim)}>
                  Reject
                </Button>
                {claim.status === 'PENDING' && (
                  <Button variant="ghost" loading={busy} onClick={() => handleEscalate(claim.id)}>
                    Escalate
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

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
