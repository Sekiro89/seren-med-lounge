'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChartBar, Warning } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  DateRangePicker,
  presetRange,
  rangeDays,
  rangeLabel,
  shiftDate,
  type DateRange,
  type RangePreset,
} from '../../../components/ui/date-range';
import {
  Figures,
  InkSection,
  InkSheet,
  MarginNote,
  RuledBar,
  SheetHead,
  StatusWord,
} from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import { formatMoney, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { BarList } from './_components/bar-list';
import { DayChart } from './_components/day-chart';
import type { DayPoint, ReportOverview } from './_components/report-types';

const SOURCE_LABEL: Record<string, string> = {
  ONLINE_BOOKING: 'Booked online',
  RECEPTION_WALK_IN: 'Walk-in at reception',
  VIDEO_CONSULTATION: 'Video consultation',
  CAMP: 'Health camp',
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Did not arrive',
};

const STATION_LABEL: Record<string, string> = {
  VITALS: 'Vitals',
  JUNIOR_DOCTOR: 'Junior doctor',
  SENIOR_DOCTOR: 'Senior doctor',
  BILLING: 'Billing',
  PHARMACY: 'Pharmacy',
  LAB: 'Lab',
};

/** Every day in the range, with zeros where the API had nothing to report. */
function fillDays(range: DateRange, perDay: ReportOverview['perDay']): DayPoint[] {
  const byDate = new Map(perDay.map((d) => [d.date, d]));
  const out: DayPoint[] = [];
  for (let d = range.from; d <= range.to; d = shiftDate(d, 1)) {
    const row = byDate.get(d);
    out.push({ date: d, visits: row?.visits ?? 0, collectedMinor: row?.collectedMinor ?? 0 });
  }
  return out;
}

const minutes = (m: number) => `${Math.round(m)} min`;

export default function ReportsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'report:read');
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [range, setRange] = useState<DateRange>(() => presetRange('30d'));

  const { data, loading, errorStatus, reload } = useApi<ReportOverview>(
    allowed ? `/reports/overview?from=${range.from}&to=${range.to}` : null,
  );

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const days = fillDays(range, data?.perDay ?? []);
  const visits = data ? days.reduce((sum, d) => sum + d.visits, 0) : undefined;
  const waits = data ? Object.entries(data.queue.averageWaitMinutes) : [];
  const longestWait = waits.length ? waits.reduce((a, b) => (b[1] > a[1] ? b : a)) : undefined;
  const noShowPct = data ? `${Math.round(data.appointments.noShowRate * 100)}%` : undefined;

  const actions: { href: string; text: string; count: number; tone: 'warning' | 'danger' }[] = data
    ? [
        {
          href: '/follow-ups',
          text: 'Overdue follow-ups',
          count: data.care.followUpsOverdue,
          tone: 'warning',
        },
        {
          href: '/inventory',
          text: 'Stock batches expiring in 30 days',
          count: data.pharmacy.batchesExpiringIn30Days,
          tone: 'danger',
        },
        {
          href: '/billing',
          text: 'Invoices with a balance',
          count: data.money.outstandingInvoices,
          tone: 'warning',
        },
      ]
    : [];
  const show = !loading && !!data;
  const failed = errorStatus !== undefined && !loading && !data;
  const dayCount = rangeDays(range);

  return (
    <InkSheet>
      <SheetHead
        eyebrow={rangeLabel(range)}
        title="Reports"
        description="How the clinic is doing over a period: visits, money, waiting times and what needs attention."
        figures={
          <Figures
            size="sm"
            loading={loading}
            items={[
              {
                label: 'Visits',
                value: visits,
                hint: data ? `${data.appointments.total} booked` : undefined,
              },
              { label: 'New patients', value: data?.patients.new, hint: 'Registered' },
              {
                label: 'Collected',
                value: data ? formatMoney(data.money.collectedMinor) : undefined,
                hint: data
                  ? data.money.refundedMinor > 0
                    ? `${formatMoney(data.money.refundedMinor)} refunded`
                    : `${formatMoney(data.money.invoicedMinor)} invoiced`
                  : undefined,
              },
              {
                label: 'Outstanding',
                value: data ? formatMoney(data.money.outstandingMinor) : undefined,
                tone: data && data.money.outstandingMinor > 0 ? 'warning' : undefined,
                hint: data
                  ? `${data.money.outstandingInvoices} invoice${data.money.outstandingInvoices === 1 ? '' : 's'}`
                  : undefined,
              },
            ]}
          />
        }
      />

      <div className="border-b border-line px-5 py-4 sm:px-8">
        <DateRangePicker
          value={range}
          preset={preset}
          onChange={(next, key) => {
            setRange(next);
            setPreset(key);
          }}
        />
      </div>

      {failed ? (
        <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <Warning size={24} className="text-danger-fg" aria-hidden="true" />
          <p className="text-sm text-fg-muted">
            {errorStatus === 403
              ? 'Your role cannot view reports.'
              : errorStatus === 400
                ? 'This period cannot be reported on. Choose a period of at most a year.'
                : 'The report could not be loaded.'}
          </p>
          {errorStatus !== 403 && (
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-10 px-5 pb-10 pt-8 sm:px-8">
          <InkSection
            number={1}
            title="Visits and money per day"
            meta={`${dayCount} day${dayCount === 1 ? '' : 's'}: visits as ink bars, money collected as the cobalt line.`}
            action={
              <SectionLink href={`/payments?from=${range.from}&to=${range.to}`}>
                Open payments
              </SectionLink>
            }
          >
            {!show ? (
              <Skeleton className="mt-3 h-56 w-full" />
            ) : visits === 0 && data.money.collectedMinor === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <ChartBar size={24} className="text-fg-subtle" aria-hidden="true" />
                <p className="mt-3 text-sm text-fg-muted">No visits or payments in this period.</p>
              </div>
            ) : (
              <DayChart points={days} />
            )}
          </InkSection>

          <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
            <InkSection
              number={2}
              title="Where visits come from"
              action={<SectionLink href="/appointments">Appointments</SectionLink>}
            >
              {!show ? (
                <Loading />
              ) : (
                <BarList
                  rows={Object.entries(data.appointments.bySource).map(([k, v]) => ({
                    key: k,
                    label: SOURCE_LABEL[k] ?? humanize(k),
                    value: v,
                  }))}
                  empty="No appointments in this period."
                />
              )}
            </InkSection>

            <InkSection
              number={3}
              title="Visits by outcome"
              meta={noShowPct ? `${noShowPct} no-show` : undefined}
            >
              {!show ? (
                <Loading />
              ) : (
                <BarList
                  rows={Object.entries(data.appointments.byStatus).map(([k, v]) => ({
                    key: k,
                    label: STATUS_LABEL[k] ?? humanize(k),
                    value: v,
                  }))}
                  empty="No appointments in this period."
                />
              )}
            </InkSection>

            <InkSection
              number={4}
              title="Average wait by desk"
              meta={
                data
                  ? `${data.queue.tokensCalled} token${data.queue.tokensCalled === 1 ? '' : 's'} called`
                  : undefined
              }
              action={<SectionLink href="/queue">Queue</SectionLink>}
            >
              {!show ? (
                <Loading />
              ) : (
                <>
                  <BarList
                    rows={waits.map(([k, v]) => ({
                      key: k,
                      label: STATION_LABEL[k] ?? humanize(k),
                      value: v,
                      display: minutes(v),
                    }))}
                    empty="No one was called from the queue in this period."
                  />
                  {longestWait && (
                    <MarginNote className="pt-2">
                      Longest at {STATION_LABEL[longestWait[0]] ?? humanize(longestWait[0])}, about{' '}
                      <span className="tabular font-mono text-fg">{minutes(longestWait[1])}</span>.
                    </MarginNote>
                  )}
                </>
              )}
            </InkSection>

            <InkSection
              number={5}
              title="Most common diagnoses"
              meta="Signed off"
              action={<SectionLink href="/dashboard">Consultations</SectionLink>}
            >
              {!show ? (
                <Loading />
              ) : (
                <BarList
                  keepOrder
                  rows={data.topDiagnoses.map((d) => ({
                    key: `${d.icdCode ?? ''}:${d.description}`,
                    label: (
                      <>
                        {d.description}
                        {d.icdCode && (
                          <span className="tabular ml-2 font-mono text-[11px] text-fg-subtle">
                            {d.icdCode}
                          </span>
                        )}
                      </>
                    ),
                    value: d.count,
                  }))}
                  empty="No diagnoses were recorded in this period."
                />
              )}
            </InkSection>

            <InkSection
              number={6}
              title="Leads"
              action={<SectionLink href="/leads">Leads</SectionLink>}
            >
              {!show ? (
                <Loading />
              ) : (
                <div className="pt-3">
                  <Figures
                    size="sm"
                    items={[
                      { label: 'New leads', value: data.leads.new },
                      {
                        label: 'Became patients',
                        value: data.leads.converted,
                        hint:
                          data.leads.new > 0
                            ? `${Math.round((data.leads.converted / data.leads.new) * 100)}% converted`
                            : undefined,
                      },
                    ]}
                  />
                  {data.leads.new > 0 && (
                    <RuledBar
                      value={data.leads.converted}
                      max={data.leads.new}
                      tone="primary"
                      className="mt-4"
                    />
                  )}
                </div>
              )}
            </InkSection>

            <InkSection number={7} title="Things to act on" meta="As of now, not the period">
              {!show ? (
                <Loading />
              ) : (
                <ul className="divide-y divide-line">
                  {actions.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-3 py-2.5 text-[13px] hover:bg-surface-muted"
                      >
                        <span className="flex-1 text-fg">{item.text}</span>
                        {item.count > 0 ? (
                          <StatusWord tone={item.tone}>Open</StatusWord>
                        ) : (
                          <StatusWord tone="success">Clear</StatusWord>
                        )}
                        <span className="tabular w-8 text-right font-mono font-medium text-fg">
                          {item.count}
                        </span>
                        <ArrowRight size={14} className="text-fg-subtle" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </InkSection>
          </div>
        </div>
      )}
    </InkSheet>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 py-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-primary-hover"
    >
      {children}
      <ArrowRight size={12} aria-hidden="true" />
    </Link>
  );
}
