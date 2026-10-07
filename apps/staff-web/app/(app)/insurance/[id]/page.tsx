'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileX, Warning } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Textarea } from '../../../../components/ui/fields';
import { NoAccess } from '../../../../components/ui/no-access';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatMoney, fullName } from '../../../../lib/format';
import { invalidProps, req, requiredProps } from '../../../../lib/forms';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { SettleDialog, TransitionDialog } from '../_components/action-dialogs';
import { CaseTimeline, StageTracker } from '../_components/case-timeline';
import {
  canSettle,
  errorText,
  NEXT_STEPS,
  STATUS_LABEL,
  STATUS_TONE,
  type CaseDetail,
  type NextStep,
} from '../_components/insurance-types';

function Amount({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div>
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold">
        {value === null ? <span className="text-fg-subtle">Not recorded</span> : formatMoney(value)}
      </dd>
      {hint && <p className="mt-1 text-[13px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

export default function InsuranceCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const allowed = can(user.role, 'insurance:manage');
  const { data, loading, errorStatus, reload } = useApi<CaseDetail>(
    allowed ? `/insurance/cases/${encodeURIComponent(id)}` : null,
  );
  const [step, setStep] = useState<NextStep | null>(null);
  const [settling, setSettling] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const [noteBusy, setNoteBusy] = useState(false);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const back = (
    <Link
      href="/insurance"
      className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      All cases
    </Link>
  );

  if (errorStatus === 404) {
    return (
      <>
        {back}
        <Card>
          <EmptyState
            icon={FileX}
            title="Case not found"
            description="This case does not exist, or it belongs to another clinic."
          />
        </Card>
      </>
    );
  }
  if (errorStatus && !data) {
    return (
      <>
        {back}
        <Card>
          <div role="alert" className="flex items-center gap-3 px-6 py-6 text-sm text-danger-fg">
            <Warning size={20} aria-hidden="true" />
            <span>The case could not be loaded.</span>
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        </Card>
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        {back}
        <div className="flex flex-col gap-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  const steps = NEXT_STEPS[data.status];
  const settleable = canSettle(data.status);
  const hasActions = steps.length > 0 || settleable;

  const addNote = async () => {
    if (noteBusy) return;
    const text = note.trim();
    if (!text) {
      setNoteError('Write the note first.');
      document.getElementById('case-note')?.focus();
      return;
    }
    if (text.length > 4000) {
      setNoteError('Use 4000 characters or fewer.');
      document.getElementById('case-note')?.focus();
      return;
    }
    setNoteError(undefined);
    setNoteBusy(true);
    try {
      await apiClient.post(`/insurance/cases/${data.id}/notes`, { note: text });
      setNote('');
      reload();
    } catch (e) {
      setNoteError(errorText(e, 'The note was not saved. Please try again.'));
    } finally {
      setNoteBusy(false);
    }
  };

  return (
    <>
      {back}
      <PageHeader
        title={fullName(data.patient)}
        description={`${data.policy.insurerName}${data.policy.tpaName ? `, TPA ${data.policy.tpaName}` : ''}. Policy ${data.policy.policyNumber}. Opened ${formatDate(data.createdAt)}.`}
        action={<Badge tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>}
      />

      <div className="flex flex-col gap-8">
        <Card>
          <div className="flex flex-col gap-8 px-6 py-6">
            <StageTracker detail={data} />
            <dl className="grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
              <Amount label="Requested" value={data.requestedAmountMinor} />
              <Amount
                label="Approved"
                value={data.approvedAmountMinor}
                hint={
                  data.preAuthReference || data.claimReference
                    ? [
                        data.preAuthReference && `Pre-auth ${data.preAuthReference}`,
                        data.claimReference && `Claim ${data.claimReference}`,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : undefined
                }
              />
              <Amount label="Settled" value={data.settledAmountMinor} />
            </dl>
            {hasActions && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
                {settleable && <Button onClick={() => setSettling(true)}>Settle case</Button>}
                {steps.map((s) => (
                  <Button
                    key={s.to}
                    variant={s.primary ? 'primary' : 'secondary'}
                    onClick={() => setStep(s)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            )}
            {!data.invoiceId && settleable && (
              <p className="text-[13px] text-fg-subtle">
                No invoice is linked to this case, so it cannot be settled yet.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Notes and history" />
          <div className="flex flex-col gap-8 px-6 py-6">
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void addNote();
              }}
            >
              <Field
                label={req('Add a note')}
                htmlFor="case-note"
                error={noteError}
                helper="Steps here are recorded by hand. No insurer system is connected."
              >
                <Textarea
                  id="case-note"
                  maxLength={4000}
                  {...requiredProps}
                  {...invalidProps(noteError)}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteError(undefined);
                  }}
                />
              </Field>
              <div>
                <Button type="submit" variant="secondary" loading={noteBusy}>
                  Add note
                </Button>
              </div>
            </form>
            <div className="border-t border-line pt-8">
              <CaseTimeline events={data.events} />
            </div>
          </div>
        </Card>
      </div>

      <TransitionDialog detail={data} step={step} onClose={() => setStep(null)} onDone={reload} />
      <SettleDialog
        detail={data}
        open={settling}
        onClose={() => setSettling(false)}
        onDone={reload}
      />
    </>
  );
}
