'use client';

import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle,
  Flask,
  Pill,
  Receipt,
  Stethoscope,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { apiMessage } from '../../../../components/form';
import {
  BackLink,
  Button,
  Chip,
  ErrorNote,
  IconBadge,
  LinkCard,
  Note,
  Rows,
  SectionHeading,
  Skeleton,
  type Tone,
} from '../../../../components/ui';
import { apiClient } from '../../../../lib/api-client';
import {
  doctorName,
  formatDay,
  formatDayNumber,
  formatMoney,
  formatMonthShort,
  formatTime,
  formatWeekdayShort,
  relativeDay,
} from '../../../../lib/format';
import type { VisitDetail } from '../../../../lib/types';
import { useApi, useNow } from '../../../../lib/use-api';
import { isComingUp, ModeChip, visitStatus } from '../shared';

const BILL_STATUS: Record<string, { label: string; tone: Tone }> = {
  ISSUED: { label: 'To pay', tone: 'warning' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  VOID: { label: 'Cancelled', tone: 'neutral' },
};

/** `Tue 13 Oct at 10:30` for the cancel question. */
const shortWhen = (iso: string) =>
  `${formatWeekdayShort(iso)} ${formatDayNumber(iso)} ${formatMonthShort(iso)} at ${formatTime(iso)}`;

/**
 * One visit: when, with whom, how (clinic or video). Before the visit the
 * patient can join the video call or cancel; afterwards it shows what was
 * recorded (diagnosis, medicines, tests, bills).
 */
export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const visit = useApi<VisitDetail>(`/patients/me/appointments/${id}`);
  const now = useNow();
  const [justCancelled, setJustCancelled] = useState(false);

  return (
    <div>
      <BackLink href="/appointments">All visits</BackLink>

      {visit.loading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-32" />
          <Skeleton className="h-20" />
        </div>
      ) : visit.error || !visit.data ? (
        <ErrorNote
          message={visit.error ?? 'We could not load this visit.'}
          onRetry={visit.reload}
        />
      ) : (
        <Visit
          visit={visit.data}
          upcoming={isComingUp(visit.data, now)}
          justCancelled={justCancelled}
          onCancelled={() => {
            setJustCancelled(true);
            visit.reload();
          }}
        />
      )}
    </div>
  );
}

function Visit({
  visit,
  upcoming,
  justCancelled,
  onCancelled,
}: {
  visit: VisitDetail;
  upcoming: boolean;
  justCancelled: boolean;
  onCancelled: () => void;
}) {
  const status = visitStatus(visit.status, upcoming);
  const isVideo = visit.entrySource === 'VIDEO_CONSULTATION';
  const canCancel = upcoming && (visit.status === 'CONFIRMED' || visit.status === 'REQUESTED');
  const visited = visit.status === 'COMPLETED' || visit.status === 'CHECKED_IN';

  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="mb-1 text-sm text-fg-muted">{upcoming ? 'Your visit' : 'Past visit'}</p>
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.01em]">
          {formatDay(visit.scheduledAt)},{' '}
          <span className="tabular font-mono font-medium">{formatTime(visit.scheduledAt)}</span>
        </h1>
        <div className="mt-5 border-y border-line py-4">
          <div className="min-w-0">
            <p className="text-fg-muted">
              With {doctorName(visit.doctor)}
              {upcoming && <> · {relativeDay(visit.scheduledAt)}</>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ModeChip entrySource={visit.entrySource} />
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
            {visit.notes && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-sm text-fg-muted">What you told us</p>
                <p className="mt-1 whitespace-pre-line">{visit.notes}</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {justCancelled && visit.status === 'CANCELLED' && (
        <div
          role="status"
          className="flex items-center gap-3 border-l-2 border-success-fg bg-success-bg py-3 pl-4 pr-3 text-success-fg"
        >
          <CheckCircle size={22} aria-hidden="true" />
          <p className="font-medium">Your visit is cancelled. The slot is free for someone else.</p>
        </div>
      )}

      {upcoming && (isVideo || canCancel) && (
        <section aria-label="What you can do" className="flex flex-col gap-3">
          {isVideo && <JoinVideo appointmentId={visit.id} />}
          {canCancel && <CancelVisit visit={visit} onCancelled={onCancelled} />}
        </section>
      )}

      {visit.encounter ? (
        <FromThisVisit encounter={visit.encounter} />
      ) : (
        !upcoming &&
        visited && (
          <p className="border-t border-fg pt-4 text-fg-muted">
            Nothing was recorded for this visit yet.
          </p>
        )
      )}
    </div>
  );
}

/** A calm note for messages that are not errors (too early to join, video not switched on). */
function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div role="status">
      <Note>
        <p className="font-medium">{children}</p>
      </Note>
    </div>
  );
}

function JoinVideo({ appointmentId }: { appointmentId: string }) {
  const [joining, setJoining] = useState(false);
  const [note, setNote] = useState<string>();

  async function join() {
    setJoining(true);
    setNote(undefined);
    try {
      const { joinUrl } = await apiClient.get<{ joinUrl: string }>(
        `/patients/me/appointments/${appointmentId}/video`,
      );
      window.open(joinUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setNote(
        e instanceof ApiError
          ? apiMessage(e.body, 'We could not open the video call just now.')
          : 'You seem to be offline. Check your connection.',
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        full
        loading={joining}
        onClick={join}
        icon={<VideoCamera size={22} aria-hidden="true" />}
      >
        Join video consultation
      </Button>
      {note && <InfoNote>{note}</InfoNote>}
    </div>
  );
}

function CancelVisit({ visit, onCancelled }: { visit: VisitDetail; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  async function cancel() {
    setSending(true);
    setError(undefined);
    try {
      await apiClient.post(`/patients/me/appointments/${visit.id}/cancel`);
      onCancelled();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiMessage(e.body, 'We could not cancel this visit just now.')
          : 'You seem to be offline. Check your connection.',
      );
    } finally {
      setSending(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" full onClick={() => setConfirming(true)}>
        Cancel this visit
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-y border-fg py-5">
      <p className="font-semibold">
        Cancel your visit on {shortWhen(visit.scheduledAt)} with {doctorName(visit.doctor)}?
      </p>
      {error && <ErrorNote message={error} />}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button full loading={sending} onClick={cancel}>
          Yes, cancel
        </Button>
        <Button
          variant="secondary"
          full
          disabled={sending}
          onClick={() => {
            setConfirming(false);
            setError(undefined);
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}

function FromThisVisit({ encounter }: { encounter: NonNullable<VisitDetail['encounter']> }) {
  const diagnoses = encounter.diagnoses
    .map((d) => ({ id: d.id, latest: d.versions[0] }))
    .filter((d) => d.latest);
  const medicines = encounter.prescriptions
    .filter((p) => p.status !== 'CANCELLED')
    .flatMap((p) => p.items);
  const tests = encounter.labOrders.flatMap((o) => o.items);
  const bills = encounter.invoices;

  if (diagnoses.length + medicines.length + tests.length + bills.length === 0) {
    return (
      <p className="border-t border-fg pt-4 text-fg-muted">
        Nothing was recorded for this visit yet.
      </p>
    );
  }

  return (
    <section aria-labelledby="from-this-visit" className="flex flex-col gap-8">
      <h2 id="from-this-visit" className="-mb-4 text-[1.25rem] font-semibold text-fg">
        From this visit
      </h2>

      {diagnoses.length > 0 && (
        <Group icon={Stethoscope} title="Diagnosis">
          {diagnoses.map((d) => (
            <li key={d.id} className="py-3">
              <p className="font-semibold">{d.latest.description}</p>
              {d.latest.icdCode && (
                <p className="text-sm text-fg-subtle">
                  Code <span className="font-mono">{d.latest.icdCode}</span>
                </p>
              )}
            </li>
          ))}
        </Group>
      )}

      {medicines.length > 0 && (
        <Group icon={Pill} title="Medicines prescribed">
          {medicines.map((m) => (
            <li key={m.id} className="py-3">
              <p className="font-medium">{m.medicationName}</p>
              <p className="text-sm text-fg-muted">
                {m.dosage} · {m.frequency}
              </p>
            </li>
          ))}
        </Group>
      )}

      {tests.length > 0 && (
        <Group icon={Flask} title="Tests">
          {tests.map((t) => {
            const result = t.results[0];
            return (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
                <p className="font-medium">{t.testName}</p>
                {result ? (
                  <p className="tabular font-mono text-lg">
                    {result.resultValue}
                    {result.unit && (
                      <span className="ml-1.5 font-sans text-sm text-fg-muted">{result.unit}</span>
                    )}
                  </p>
                ) : (
                  <p className="text-fg-muted">Waiting for results</p>
                )}
              </li>
            );
          })}
        </Group>
      )}

      {bills.length > 0 && (
        <div>
          <SectionHeading>
            <span className="flex items-center gap-2">
              <Receipt size={20} aria-hidden="true" />
              Bills
            </span>
          </SectionHeading>
          <Rows>
            {bills.map((b) => {
              const status = BILL_STATUS[b.status] ?? { label: 'Bill', tone: 'neutral' as Tone };
              return (
                <li key={b.id}>
                  <LinkCard href="/bills">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div>
                        <p className="font-medium">
                          Bill <span className="font-mono">#{b.number}</span>
                        </p>
                        <p className="tabular font-mono text-fg-muted">
                          {formatMoney(b.totalMinor)}
                        </p>
                      </div>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </div>
                  </LinkCard>
                </li>
              );
            })}
          </Rows>
        </div>
      )}
    </section>
  );
}

function Group({ icon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex min-h-12 items-center gap-2 border-t border-fg pt-3">
        <IconBadge icon={icon} />
        <h3 className="text-[1.06rem] font-semibold">{title}</h3>
      </div>
      <Rows>{children}</Rows>
    </div>
  );
}
