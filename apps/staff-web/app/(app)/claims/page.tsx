'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { clearStaffSession, getStaffToken, getStaffUser, type StaffUser } from '../../lib/auth';
import { can } from '../../lib/permissions';

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
  phone_dob_lastname_mismatch: 'Phone + DOB matched, name did not',
  phone_dob_multiple: 'Multiple records share this phone + DOB',
  phone_dob_all_claimed: 'Matching record(s) already have an account',
  name_dob_different_phone: 'Name + DOB matched, phone did not',
  name_dob_different_phone_multiple: 'Multiple records share this name + DOB',
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * Patient Record Claim Rules (docs/architecture/open-questions.md#3) —
 * the support/administrative verification flow rules 7 and 12 require:
 * every self-signup PatientsService.selfRegister couldn't confidently
 * resolve on its own lands here as a PENDING PatientClaimRequest, with
 * the candidate Patient record(s) it flagged shown side by side so a
 * reviewer can pick the right outcome — link to an existing record
 * (never creating a duplicate), create a genuinely new record, or
 * reject when identity can't be established.
 */
export default function ClaimsPage() {
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null);
  const [reasonByClaim, setReasonByClaim] = useState<Record<string, string>>({});

  // Inline fetch-on-mount, not a reusable named function — see
  // dashboard/page.tsx's comment on why (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!getStaffToken()) {
      router.replace('/login');
      return;
    }

    apiClient
      .get<ClaimRow[]>('/patient-claims')
      .then((res) => {
        setUser(getStaffUser());
        setClaims(res);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearStaffSession();
          router.replace('/login');
          return;
        }
        setLoadError('Could not load pending claims. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const removeClaim = (claimId: string) => {
    setClaims((prev) => prev.filter((claim) => claim.id !== claimId));
  };

  const handleLink = async (claimId: string, patientId: string) => {
    setActionError(null);
    setBusyClaimId(claimId);
    try {
      await apiClient.post(`/patient-claims/${claimId}/link`, { patientId });
      removeClaim(claimId);
    } catch (error) {
      setActionError(errorMessage(error, 'Could not link this claim.'));
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleCreateNew = async (claimId: string) => {
    setActionError(null);
    setBusyClaimId(claimId);
    try {
      await apiClient.post(`/patient-claims/${claimId}/create-new`);
      removeClaim(claimId);
    } catch (error) {
      setActionError(errorMessage(error, 'Could not create a new record for this claim.'));
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleReject = async (claimId: string) => {
    setActionError(null);
    setBusyClaimId(claimId);
    try {
      const reason = reasonByClaim[claimId]?.trim() || undefined;
      await apiClient.post(`/patient-claims/${claimId}/reject`, { reason });
      removeClaim(claimId);
    } catch (error) {
      setActionError(errorMessage(error, 'Could not reject this claim.'));
    } finally {
      setBusyClaimId(null);
    }
  };

  const handleEscalate = async (claimId: string) => {
    setActionError(null);
    setBusyClaimId(claimId);
    try {
      const reason = reasonByClaim[claimId]?.trim() || undefined;
      await apiClient.post(`/patient-claims/${claimId}/escalate`, { reason });
      setClaims((prev) =>
        prev.map((claim) => (claim.id === claimId ? { ...claim, status: 'ESCALATED' } : claim)),
      );
    } catch (error) {
      setActionError(errorMessage(error, 'Could not escalate this claim.'));
    } finally {
      setBusyClaimId(null);
    }
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!can(user?.role, 'patient:write')) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-slate-500">You do not have permission to view this page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 bg-slate-50 px-6 py-10">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Pending account claims</h1>
        <p className="text-sm text-slate-600">
          Patient signups and Reception intake attempts that could not be confidently matched to an
          existing record on their own.
        </p>
      </header>

      {actionError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {claims.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No pending claims.</p>
        </Card>
      ) : (
        claims.map((claim) => {
          const busy = busyClaimId === claim.id;
          return (
            <Card key={claim.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {claim.source === 'SELF_SIGNUP' ? 'Patient signup' : 'Reception intake'}
                </span>
                {claim.status === 'ESCALATED' && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Escalated
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {MATCH_REASON_LABEL[claim.matchReason] ?? claim.matchReason}
                </span>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {claim.source === 'SELF_SIGNUP'
                      ? 'Submitted at signup'
                      : 'Submitted by Reception'}
                  </h2>
                  <p className="text-sm text-slate-900">
                    {claim.firstName} {claim.lastName}
                  </p>
                  <p className="text-sm text-slate-600">DOB {formatDate(claim.dateOfBirth)}</p>
                  <p className="text-sm text-slate-600">{claim.phone}</p>
                  <p className="text-sm text-slate-600">{claim.email ?? 'No email provided'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Requested {new Date(claim.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Candidate record{claim.candidates.length === 1 ? '' : 's'}
                  </h2>
                  {claim.candidates.length === 0 ? (
                    <p className="text-sm text-slate-500">No candidates flagged.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {claim.candidates.map((candidate) => (
                        <li
                          key={candidate.id}
                          className="rounded-md border border-slate-200 p-2 text-sm text-slate-700"
                        >
                          <p className="text-slate-900">
                            {candidate.firstName} {candidate.lastName}
                          </p>
                          <p className="text-slate-600">DOB {formatDate(candidate.dateOfBirth)}</p>
                          <p className="text-slate-600">{candidate.phone}</p>
                          <p className="text-slate-600">{candidate.email ?? 'No email on file'}</p>
                          <Button
                            variant="secondary"
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

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => handleCreateNew(claim.id)}
                >
                  None of these — create new record
                </Button>
                <input
                  className="min-w-[12rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Reason for rejecting (optional)"
                  value={reasonByClaim[claim.id] ?? ''}
                  onChange={(event) =>
                    setReasonByClaim((prev) => ({ ...prev, [claim.id]: event.target.value }))
                  }
                />
                <Button variant="ghost" disabled={busy} onClick={() => handleReject(claim.id)}>
                  Reject
                </Button>
                {claim.status === 'PENDING' && (
                  <Button variant="ghost" disabled={busy} onClick={() => handleEscalate(claim.id)}>
                    {busy ? 'Working…' : 'Escalate'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}
    </main>
  );
}
