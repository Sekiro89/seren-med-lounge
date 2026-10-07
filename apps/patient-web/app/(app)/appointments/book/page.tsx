'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@serenemed/api-client';
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CaretRight,
  CheckCircle,
  Phone,
  Stethoscope,
  VideoCamera,
  type Icon,
} from '@phosphor-icons/react';
import { Field, FormError, TextArea, apiMessage } from '../../../../components/form';
import {
  Button,
  ButtonLink,
  CardsSkeleton,
  EmptyState,
  ErrorNote,
  PageTitle,
  SegmentRule,
} from '../../../../components/ui';
import { apiClient } from '../../../../lib/api-client';
import { formatDay, formatTime } from '../../../../lib/format';
import type { BookingDoctor, BookingMode, Slot } from '../../../../lib/types';
import { useApi, useNow } from '../../../../lib/use-api';
import { DayTimeStep, nextDays } from './_components/day-time-step';

const STEPS = 4;
const REASON_MAX = 500;
const VIDEO_NOTE = 'Until video calls are switched on, the doctor will phone you at this time.';

const MODES: Array<{ mode: BookingMode; icon: Icon; title: string; text: string }> = [
  { mode: 'IN_PERSON', icon: Buildings, title: 'At the clinic', text: 'Visit SereneMed Lounge' },
  {
    mode: 'VIDEO',
    icon: VideoCamera,
    title: 'Video consultation',
    text: 'From home on your phone',
  },
];

const MODE_LABEL: Record<BookingMode, string> = {
  IN_PERSON: 'At the clinic',
  VIDEO: 'Video consultation',
};

const ROLE_LABEL: Record<BookingDoctor['role'], string> = {
  SENIOR_DOCTOR: 'Senior doctor',
  JUNIOR_DOCTOR: 'Doctor',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** [1..6] -> "Mon to Sat"; [1,3,5] -> "Mon, Wed and Fri" (week starts Monday). */
function workingDays(days: number[]): string {
  const order = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (order.length === 0) return 'Days to be confirmed';
  if (order.length === 7) return 'Sees patients every day';
  const pos = order.map((d) => (d + 6) % 7);
  const consecutive = pos.every((p, i) => i === 0 || p === pos[i - 1]! + 1);
  const names = order.map((d) => WEEKDAYS[d]);
  if (consecutive && names.length >= 3) return `Sees patients ${names[0]} to ${names.at(-1)}`;
  if (names.length === 1) return `Sees patients on ${names[0]}`;
  return `Sees patients ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

interface Booked {
  id: string;
}

export default function BookPage() {
  return (
    <Suspense fallback={<CardsSkeleton count={2} />}>
      <BookingFlow />
    </Suspense>
  );
}

/**
 * Online booking, one decision per screen (design system 18). The step
 * lives in the URL so the browser back button walks back through it; the
 * choices live in state, so a deep link without them starts at step 1.
 */
function BookingFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = Number(params.get('step')) || 1;

  // Home's "Video consult" tile arrives with the type already chosen.
  const [mode, setMode] = useState<BookingMode | undefined>(() =>
    params.get('mode') === 'video' ? 'VIDEO' : undefined,
  );
  const [doctor, setDoctor] = useState<BookingDoctor>();
  const [date, setDate] = useState<string>();
  const [slot, setSlot] = useState<Slot>();
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const [booked, setBooked] = useState<Booked>();

  const now = useNow();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  // Recomputed only when the clinic day changes, not every minute.
  const days = useMemo(() => nextDays(today, 14), [today]);

  // The furthest step the current choices allow.
  const reachable = !mode ? 1 : !doctor ? 2 : !slot ? 3 : 4;
  const step = Math.min(Math.max(requested, 1), reachable, STEPS);

  useEffect(() => {
    if (!booked && step !== requested) router.replace(`?step=${step}`, { scroll: false });
  }, [booked, step, requested, router]);

  const go = (next: number) => router.push(`?step=${next}`);
  const back = () => router.back();

  const workingDay = doctor ? days.find((d) => doctor.days.includes(d.weekday))?.date : undefined;
  const chosenDate = date ?? workingDay;

  async function confirm() {
    if (!mode || !doctor || !slot) return;
    setSending(true);
    setError(undefined);
    try {
      const result = await apiClient.post<Booked>('/patients/me/appointments', {
        doctorId: doctor.id,
        scheduledAt: slot.start,
        mode,
        reason: reason.trim() || undefined,
      });
      setBooked(result);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? {
              message: apiMessage(e.body, 'We could not book this time. Please try again.'),
              conflict: e.status === 409,
            }
          : {
              message: 'We could not reach SereneMed. Check your connection and try again.',
              conflict: false,
            },
      );
    } finally {
      setSending(false);
    }
  }

  if (booked && mode && doctor && slot) {
    return <Success id={booked.id} mode={mode} doctor={doctor} slot={slot} />;
  }

  const STEP_NAME = ['Type of visit', 'Doctor', 'Time', 'Confirm'];

  return (
    <div className={`flex flex-col gap-6 ${step === 3 && slot ? 'pb-28 lg:pb-24' : ''}`}>
      <div className="flex flex-col gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={back}
            className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-control px-2 text-[0.94rem] text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </button>
        ) : (
          <Link
            href="/appointments"
            className="-ml-2 inline-flex min-h-11 items-center gap-2 self-start rounded-control px-2 text-[0.94rem] text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Visits
          </Link>
        )}
        <p className="text-fg-muted" aria-live="polite">
          Step <span className="font-mono">{step}</span> of{' '}
          <span className="font-mono">{STEPS}</span> · {STEP_NAME[step - 1]}
        </p>
        <SegmentRule total={STEPS} done={step} />
      </div>

      {step === 1 && (
        <div>
          <PageTitle
            title="How would you like to see the doctor?"
            description="You can change this later by messaging the clinic."
          />
          <div
            role="radiogroup"
            aria-label="Type of visit"
            className="divide-y divide-line border-y border-line"
          >
            {MODES.map((option) => (
              <ChoiceRow
                key={option.mode}
                icon={option.icon}
                title={option.title}
                text={option.text}
                selected={mode === option.mode}
                onSelect={() => {
                  setMode(option.mode);
                  go(2);
                }}
                note={option.mode === 'VIDEO' ? VIDEO_NOTE : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <PageTitle title="Choose your doctor" />
          <DoctorStep
            selected={doctor}
            onSelect={(d) => {
              if (d.id !== doctor?.id) {
                setDoctor(d);
                setDate(undefined);
                setSlot(undefined);
              }
              go(3);
            }}
          />
        </div>
      )}

      {step === 3 && doctor && (
        <div>
          <h1 className="mb-4 text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] lg:text-[1.9rem]">
            Pick a time
          </h1>
          <div className="mb-5 flex items-center gap-3 border-y border-line py-3">
            <Initials name={doctor.fullName} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{doctor.fullName}</p>
              <p className="text-sm text-fg-muted">
                {ROLE_LABEL[doctor.role]} · {mode === 'VIDEO' ? 'by video' : 'at the clinic'}
              </p>
            </div>
            <button
              type="button"
              onClick={back}
              className="min-h-12 cursor-pointer rounded-control px-2 font-medium text-primary hover:bg-primary-subtle"
            >
              Change
            </button>
          </div>
          <DayTimeStep
            doctor={doctor}
            days={days}
            date={chosenDate}
            slot={slot}
            onDate={(d) => {
              setDate(d);
              setSlot(undefined);
            }}
            onSlot={setSlot}
          />
          {slot && (
            <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-fg bg-surface lg:bottom-0">
              <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-3 sm:px-6 lg:px-10">
                <div className="min-w-0 flex-1" aria-live="polite">
                  <p className="text-sm text-fg-muted">{formatDay(slot.start)}</p>
                  <p className="truncate font-semibold">
                    <span className="tabular font-mono">{formatTime(slot.start)}</span> with{' '}
                    {shortDoctor(doctor.fullName)}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setError(undefined);
                    go(4);
                  }}
                >
                  Continue
                  <ArrowRight size={20} aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 4 && mode && doctor && slot && (
        <div className="flex flex-col gap-6">
          <PageTitle title="Check and confirm" />
          <Summary mode={mode} doctor={doctor} slot={slot} />
          <Field
            label="What would you like to talk about? (optional)"
            htmlFor="reason"
            hint={`${reason.length} of ${REASON_MAX} characters`}
          >
            <TextArea
              id="reason"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: a cough for two weeks"
            />
          </Field>
          {error && (
            <div className="flex flex-col gap-3">
              <FormError message={error.message} />
              {error.conflict && (
                <Button
                  variant="secondary"
                  full
                  onClick={() => {
                    back();
                    setSlot(undefined);
                    setError(undefined);
                  }}
                >
                  Choose another time
                </Button>
              )}
            </div>
          )}
          <Button full loading={sending} onClick={confirm}>
            Confirm booking
          </Button>
        </div>
      )}
    </div>
  );
}

/** "Dr. Meera Iyer" -> "Dr. Meera"; a bare name gives its first word. */
function shortDoctor(name: string): string {
  const m = name.match(/^(Dr\.?)\s+(\S+)/i);
  return m ? `${m[1]} ${m[2]}` : (name.split(/\s+/)[0] ?? name);
}

/** A doctor's initials in a square ink block (people are not avatars here, but entries). */
function Initials({ name }: { name: string }) {
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-control bg-fg text-sm font-semibold text-on-primary"
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function ChoiceRow({
  icon: IconComponent,
  title,
  text,
  note,
  selected,
  onSelect,
}: {
  icon: Icon;
  title: string;
  text: string;
  note?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-start gap-4 px-3 py-5 text-left transition-colors ${
        selected ? 'bg-primary-subtle' : 'hover:bg-surface-muted'
      }`}
    >
      <IconComponent size={28} className="mt-0.5 shrink-0 text-fg" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-fg-muted">{text}</span>
        {note && (
          <span className="mt-2 flex items-start gap-2 text-sm text-fg-muted">
            <Phone size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            {note}
          </span>
        )}
      </span>
      {selected ? (
        <CheckCircle size={24} className="shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <CaretRight size={20} className="mt-1 shrink-0 text-fg-subtle" aria-hidden="true" />
      )}
    </button>
  );
}

function DoctorStep({
  selected,
  onSelect,
}: {
  selected: BookingDoctor | undefined;
  onSelect: (doctor: BookingDoctor) => void;
}) {
  const doctors = useApi<BookingDoctor[]>('/patients/me/booking/doctors');

  if (doctors.loading) return <CardsSkeleton count={2} />;
  if (doctors.error) return <ErrorNote message={doctors.error} onRetry={doctors.reload} />;
  if (!doctors.data?.length) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No doctors to choose from"
        description="Online booking isn't open yet. Please call the clinic."
      />
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Doctor"
      className="divide-y divide-line border-y border-line"
    >
      {doctors.data.map((d) => {
        const isSelected = selected?.id === d.id;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(d)}
            className={`flex w-full cursor-pointer items-center gap-4 px-3 py-4 text-left transition-colors ${
              isSelected ? 'bg-primary-subtle' : 'hover:bg-surface-muted'
            }`}
          >
            <Initials name={d.fullName} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{d.fullName}</span>
              <span className="block text-sm text-fg-muted">
                {ROLE_LABEL[d.role]} · {workingDays(d.days)}
              </span>
            </span>
            {isSelected ? (
              <CheckCircle size={24} className="shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <CaretRight size={20} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Summary({ mode, doctor, slot }: { mode: BookingMode; doctor: BookingDoctor; slot: Slot }) {
  const rows: Array<[string, ReactNode]> = [
    ['Type', MODE_LABEL[mode]],
    ['Doctor', doctor.fullName],
    ['Day', formatDay(slot.start)],
    [
      'Time',
      <span key="time" className="tabular font-mono">
        {formatTime(slot.start)}
      </span>,
    ],
  ];
  return (
    <div className="border-t border-fg">
      <dl className="divide-y divide-line border-b border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="text-right font-semibold text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      {mode === 'VIDEO' && (
        <p className="mt-4 flex items-start gap-2 text-fg-muted">
          <Phone size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          {VIDEO_NOTE}
        </p>
      )}
    </div>
  );
}

function Success({
  id,
  mode,
  doctor,
  slot,
}: {
  id: string;
  mode: BookingMode;
  doctor: BookingDoctor;
  slot: Slot;
}) {
  return (
    <div className="flex flex-col gap-8" role="status">
      <div>
        <CheckCircle size={48} className="text-success-fg" aria-hidden="true" />
        <h1 className="mt-3 text-[1.6rem] font-semibold leading-tight tracking-[-0.01em] text-fg">
          You&apos;re booked
        </h1>
        <p className="mt-1.5 text-fg-muted">We look forward to seeing you.</p>
      </div>
      <Summary mode={mode} doctor={doctor} slot={slot} />
      <div className="flex flex-col gap-3">
        <ButtonLink href={`/appointments/${id}`} full>
          See my appointments
        </ButtonLink>
        <ButtonLink href="/home" variant="secondary" full>
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}
