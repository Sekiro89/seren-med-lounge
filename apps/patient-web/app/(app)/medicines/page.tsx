'use client';

import { Pill } from '@phosphor-icons/react';
import {
  BackLink,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  Note,
  PageTitle,
  Rows,
  SectionHeading,
} from '../../../components/ui';
import { courseLength, doctorName, formatDayNumber, formatMonthShort } from '../../../lib/format';
import type { Prescription, PrescriptionItem } from '../../../lib/types';
import { useApi, useNow } from '../../../lib/use-api';

const DAY_MS = 86_400_000;

/** `26 Oct` */
const shortDate = (iso: string) => `${formatDayNumber(iso)} ${formatMonthShort(iso)}`;

interface Medicine {
  item: PrescriptionItem;
  prescription: Prescription;
  /** Last day of the course, or null when it has no set end. */
  lastDay: string | null;
  /** When the course ends (start + duration), for sorting. */
  endsAt: number;
  stopped: boolean;
}

/**
 * "What do I take, and how?" (18.2). Each medicine from a current course
 * gets its own card with the dose and how often in plain words; finished
 * and stopped courses follow, compact.
 */
export default function MedicinesPage() {
  const prescriptions = useApi<Prescription[]>('/patients/me/prescriptions');
  const now = useNow();

  const medicines: Medicine[] = (prescriptions.data ?? []).flatMap((prescription) =>
    prescription.items.map((item) => {
      const start = new Date(prescription.createdAt).getTime();
      const endsAt = item.durationDays ? start + item.durationDays * DAY_MS : Infinity;
      return {
        item,
        prescription,
        lastDay: item.durationDays
          ? new Date(start + (item.durationDays - 1) * DAY_MS).toISOString()
          : null,
        endsAt,
        stopped: prescription.status === 'CANCELLED',
      };
    }),
  );

  const current = medicines
    .filter((m) => m.prescription.status === 'ACTIVE' && m.endsAt > now)
    .sort((a, b) => b.prescription.createdAt.localeCompare(a.prescription.createdAt));
  const past = medicines
    .filter((m) => !current.includes(m))
    .sort((a, b) => b.prescription.createdAt.localeCompare(a.prescription.createdAt));

  return (
    <div>
      <BackLink href="/records">Records</BackLink>
      <PageTitle title="Medicines" description="What to take, how often, and for how long." />

      {prescriptions.loading ? (
        <CardsSkeleton count={2} />
      ) : prescriptions.error ? (
        <ErrorNote message={prescriptions.error} onRetry={prescriptions.reload} />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="taking-now">
            <SectionHeading>
              <span id="taking-now">Taking now</span>
            </SectionHeading>
            {current.length === 0 ? (
              <EmptyState
                icon={Pill}
                title="No medicines right now"
                description="When your doctor prescribes a medicine, it will show up here with how to take it."
              />
            ) : (
              <Rows>
                {current.map((m) => (
                  <li key={m.item.id}>
                    <CurrentMedicine medicine={m} />
                  </li>
                ))}
              </Rows>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-medicines">
              <SectionHeading>
                <span id="past-medicines">Past medicines</span>
              </SectionHeading>
              <Rows>
                {past.map((m) => (
                  <li key={m.item.id} className="py-4">
                    <PastMedicine medicine={m} />
                  </li>
                ))}
              </Rows>
            </section>
          )}

          <Note>Do not stop or change a medicine without talking to your doctor.</Note>
        </div>
      )}
    </div>
  );
}

function CurrentMedicine({ medicine }: { medicine: Medicine }) {
  const { item, prescription, lastDay } = medicine;
  return (
    <article className="py-5">
      <h3 className="text-[1.18rem] font-semibold leading-snug text-fg">{item.medicationName}</h3>
      <p className="mt-1 font-medium text-fg">
        {item.dosage} · {item.frequency}
      </p>
      <p className="mt-0.5 text-fg-muted">
        {item.durationDays && lastDay
          ? `For ${courseLength(item.durationDays)} · until ${shortDate(lastDay)}`
          : 'Keep taking until your doctor tells you to stop'}
      </p>
      {item.instructions && (
        <p className="mt-3 border-l-2 border-primary pl-4">{item.instructions}</p>
      )}
      <p className="mt-4 text-sm text-fg-muted">
        Prescribed by {doctorName(prescription.author)} on {shortDate(prescription.createdAt)}
      </p>
    </article>
  );
}

function PastMedicine({ medicine }: { medicine: Medicine }) {
  const { item, prescription, lastDay, stopped } = medicine;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="font-medium">{item.medicationName}</p>
        <p className="text-sm text-fg-muted">
          {item.dosage} · {item.frequency}
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          {doctorName(prescription.author)}, {shortDate(prescription.createdAt)}
          {!stopped && lastDay && ` · finished ${shortDate(lastDay)}`}
        </p>
      </div>
      {stopped ? <Chip tone="neutral">Stopped by your doctor</Chip> : <Chip>Finished</Chip>}
    </div>
  );
}
