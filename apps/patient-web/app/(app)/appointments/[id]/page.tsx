'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  Flask,
  Info,
  Pill,
  Receipt,
  Stethoscope,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { apiMessage } from '../../../../components/form';
import {
  Button,
  Card,
  Chip,
  DateTile,
  ErrorNote,
  IconBadge,
  LinkCard,
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
      <Link
        href="/appointments"
        className="-ml-2 mb-6 inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-primary"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        All appointments
      </Link>

      {visit.loading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-48" />
          <Skeleton className="h-28" />
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
        <h1 className="sr-only">Your visit</h1>
        <Card className="flex gap-5">
          <DateTile iso={visit.scheduledAt} muted={!upcoming} />
          <div className="min-w-0 flex-1">
            <p className="text-[1.35rem] font-bold leading-tight">
              {formatDay(visit.scheduledAt)}, {formatTime(visit.scheduledAt)}
            </p>
            <p className="mt-1 text-fg-muted">
              With {doctorName(visit.doctor)}
              {upcoming && <> · {relativeDay(visit.scheduledAt)}</>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ModeChip entrySource={visit.entrySource} />
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
            {visit.notes && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-sm font-semibold text-fg-subtle">What you told us</p>
                <p className="mt-1 whitespace-pre-line">{visit.notes}</p>
              </div>
            )}
          </div>
        </Card>
      </header>

      {justCancelled && visit.status === 'CANCELLED' && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-success-bg px-5 py-4 text-success-fg"
        >
          <CheckCircle size={22} aria-hidden="true" />
          <p className="font-semibold">
            Your visit is cancelled. The slot is free for someone else.
          </p>
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
          <Card>
            <p className="text-fg-muted">Nothing was recorded for this visit yet.</p>
          </Card>
        )
      )}
    </div>
  );
}

/** A calm note for messages that are not errors (too early to join, video not switched on). */
function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl bg-info-bg px-5 py-4 text-info-fg"
    >
      <Info size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="font-semibold">{children}</p>
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
    <Card className="flex flex-col gap-4">
      <p className="font-bold">
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
    </Card>
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
      <Card>
        <p className="text-fg-muted">Nothing was recorded for this visit yet.</p>
      </Card>
    );
  }

  return (
    <section aria-labelledby="from-this-visit" className="flex flex-col gap-6">
      <h2 id="from-this-visit" className="text-[1.12rem] font-bold text-fg">
        From this visit
      </h2>

      {diagnoses.length > 0 && (
        <Group icon={Stethoscope} title="Diagnosis">
          {diagnoses.map((d) => (
            <li key={d.id}>
              <p className="text-lg font-bold">{d.latest.description}</p>
              {d.latest.icdCode && (
                <p className="text-sm text-fg-subtle">Code {d.latest.icdCode}</p>
              )}
            </li>
          ))}
        </Group>
      )}

      {medicines.length > 0 && (
        <Group icon={Pill} title="Medicines prescribed">
          {medicines.map((m) => (
            <li key={m.id}>
              <p className="font-bold">{m.medicationName}</p>
              <p className="text-fg-muted">
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
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="font-bold">{t.testName}</p>
                {result ? (
                  <p className="tabular">
                    {result.resultValue}
                    {result.unit && ` ${result.unit}`}
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
          <ul className="flex flex-col gap-3">
            {bills.map((b) => {
              const status = BILL_STATUS[b.status] ?? { label: 'Bill', tone: 'neutral' as Tone };
              return (
                <li key={b.id}>
                  <LinkCard href="/bills">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div>
                        <p className="font-bold">Bill #{b.number}</p>
                        <p className="tabular text-fg-muted">{formatMoney(b.totalMinor)}</p>
                      </div>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </div>
                  </LinkCard>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Group({ icon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <IconBadge icon={icon} tone="primary" />
        <h3 className="font-bold">{title}</h3>
      </div>
      <ul className="flex flex-col gap-4">{children}</ul>
    </Card>
  );
}
