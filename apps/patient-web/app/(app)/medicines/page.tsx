'use client';

import { Info, Pill } from '@phosphor-icons/react';
import {
  Card,
  CardsSkeleton,
  Chip,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
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
              <ul className="flex flex-col gap-4">
                {current.map((m) => (
                  <li key={m.item.id}>
                    <CurrentMedicine medicine={m} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="past-medicines">
              <SectionHeading>
                <span id="past-medicines">Past medicines</span>
              </SectionHeading>
              <Card as="div" className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {past.map((m) => (
                    <li key={m.item.id} className="px-5 py-4 sm:px-6">
                      <PastMedicine medicine={m} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <Card className="flex items-center gap-4">
            <IconBadge icon={Info} tone="info" />
            <p className="text-fg-muted">
              Do not stop or change a medicine without talking to your doctor.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function CurrentMedicine({ medicine }: { medicine: Medicine }) {
  const { item, prescription, lastDay } = medicine;
  return (
    <Card as="article">
      <h3 className="text-xl font-bold leading-snug text-fg">{item.medicationName}</h3>
      <p className="mt-2 text-lg font-semibold text-fg">
        {item.dosage} · {item.frequency}
      </p>
      <p className="mt-1 text-fg-muted">
        {item.durationDays && lastDay
          ? `For ${courseLength(item.durationDays)} · until ${shortDate(lastDay)}`
          : 'Keep taking until your doctor tells you to stop'}
      </p>
      {item.instructions && (
        <p className="mt-4 rounded-xl bg-primary-subtle px-4 py-3 text-primary-subtle-fg">
          {item.instructions}
        </p>
      )}
      <p className="mt-4 text-sm text-fg-muted">
        Prescribed by {doctorName(prescription.author)} on {shortDate(prescription.createdAt)}
      </p>
    </Card>
  );
}

function PastMedicine({ medicine }: { medicine: Medicine }) {
  const { item, prescription, lastDay, stopped } = medicine;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="font-bold">{item.medicationName}</p>
        <p className="text-fg-muted">
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
