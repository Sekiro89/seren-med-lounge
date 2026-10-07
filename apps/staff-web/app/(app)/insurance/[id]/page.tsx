'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileX, Warning } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Field, Textarea } from '../../../../components/ui/fields';
import { NoAccess } from '../../../../components/ui/no-access';
import {
  Figures,
  InkSection,
  InkSheet,
  LedgerLine,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../../components/ui/ink';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, fullName } from '../../../../lib/format';
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
  rupeeFigure,
  STATUS_LABEL,
  STATUS_TONE,
  type CaseDetail,
  type NextStep,
} from '../_components/insurance-types';

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
      className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Insurance cases
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
        <InkSheet className="flex flex-col gap-6 p-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </InkSheet>
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

  const amount = (value: number | null) => (value === null ? undefined : rupeeFigure(value));
  const references = [
    data.preAuthReference && { label: 'Pre-auth reference', value: data.preAuthReference },
    data.claimReference && { label: 'Claim reference', value: data.claimReference },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <>
      {back}
      <InkSheet>
        <SheetHead
          eyebrow={`Insurance case · opened ${formatDate(data.createdAt)}`}
          title={fullName(data.patient)}
          description={
            <>
              {data.policy.insurerName}
              {data.policy.tpaName ? `, TPA ${data.policy.tpaName}` : ''} · policy{' '}
              <span className="tabular font-mono">{data.policy.policyNumber}</span>
            </>
          }
          figures={
            <Figures
              items={[
                { label: 'Requested', value: amount(data.requestedAmountMinor) },
                { label: 'Approved', value: amount(data.approvedAmountMinor) },
                { label: 'Settled', value: amount(data.settledAmountMinor) },
              ]}
            />
          }
          action={<Badge tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>}
        />

        <div className="border-b border-line px-5 pb-4 pt-6 sm:px-10">
          <StageTracker detail={data} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 px-5 pb-8 pt-6 sm:px-8">
            <InkSection number={1} title="Notes and history" meta={`${data.events.length} entries`}>
              <form
                className="mt-3 flex flex-col gap-3"
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
                  <Button type="submit" variant="secondary" size="sm" loading={noteBusy}>
                    Add note
                  </Button>
                </div>
              </form>
              <div className="mt-6 border-t border-line">
                <CaseTimeline events={data.events} />
              </div>
            </InkSection>
          </div>

          <SheetRail label="Case actions">
            <InkSection title="Next step">
              {hasActions ? (
                <div className="mt-3 flex flex-col gap-2">
                  {settleable && (
                    <Button className="w-full" onClick={() => setSettling(true)}>
                      Settle case
                    </Button>
                  )}
                  {steps.map((s) => (
                    <Button
                      key={s.to}
                      className="w-full"
                      variant={s.primary && !settleable ? 'primary' : 'secondary'}
                      onClick={() => setStep(s)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <MarginNote className="mt-2">
                  Nothing left to do on this case. It stays here for the record.
                </MarginNote>
              )}
              {!data.invoiceId && settleable && (
                <MarginNote className="mt-2">
                  No invoice is linked to this case, so it cannot be settled yet.
                </MarginNote>
              )}
            </InkSection>

            <InkSection title="Policy">
              <dl className="mt-1 divide-y divide-line">
                <LedgerLine
                  label="Insurer"
                  value={<span className="font-sans">{data.policy.insurerName}</span>}
                />
                {data.policy.tpaName && (
                  <LedgerLine
                    label="TPA"
                    value={<span className="font-sans">{data.policy.tpaName}</span>}
                  />
                )}
                <LedgerLine label="Policy number" value={data.policy.policyNumber} />
                {references.map((r) => (
                  <LedgerLine key={r.label} label={r.label} value={r.value} />
                ))}
                <LedgerLine
                  label="Invoice"
                  value={data.invoiceId ? 'Linked' : 'Not linked'}
                  tone={data.invoiceId ? undefined : 'muted'}
                />
                <LedgerLine label="Last updated" value={formatDate(data.updatedAt)} tone="muted" />
              </dl>
            </InkSection>
          </SheetRail>
        </div>
      </InkSheet>

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
