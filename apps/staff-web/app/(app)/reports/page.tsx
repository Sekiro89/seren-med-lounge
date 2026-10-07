'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  ChartBar,
  Coins,
  HandCoins,
  Package,
  Receipt,
  Stethoscope,
  Timer,
  UserPlus,
  UsersThree,
  Warning,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader } from '../../../components/ui/card';
import {
  DateRangePicker,
  presetRange,
  rangeDays,
  rangeLabel,
  shiftDate,
  type DateRange,
  type RangePreset,
} from '../../../components/ui/date-range';
import { KPI_STRIP, KpiTile } from '../../../components/ui/kpi-tile';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
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

  const actions: { href: string; icon: Icon; text: string; count: number; tone: string }[] = data
    ? [
        {
          href: '/follow-ups',
          icon: CalendarCheck,
          text: 'Overdue follow-ups',
          count: data.care.followUpsOverdue,
          tone: 'text-warning-fg',
        },
        {
          href: '/inventory',
          icon: Package,
          text: 'Stock batches expiring in 30 days',
          count: data.pharmacy.batchesExpiringIn30Days,
          tone: 'text-danger-fg',
        },
        {
          href: '/billing',
          icon: Receipt,
          text: 'Invoices with a balance',
          count: data.money.outstandingInvoices,
          tone: 'text-fg-muted',
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={rangeLabel(range)}
        title="Reports"
        description="How the clinic is doing over a period: visits, money, waiting times and what needs attention."
      />

      <Card className="mb-6">
        <div className="px-6 py-4">
          <DateRangePicker
            value={range}
            preset={preset}
            onChange={(next, key) => {
              setRange(next);
              setPreset(key);
            }}
          />
        </div>
      </Card>

      {errorStatus !== undefined && !loading && !data ? (
        <Card>
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
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className={`sm:grid-cols-2 xl:grid-cols-3 ${KPI_STRIP}`}>
            <KpiTile
              label="Visits"
              value={visits}
              hint={data ? `${data.appointments.total} appointments booked` : undefined}
              icon={Stethoscope}
              href="/appointments"
              loading={loading}
            />
            <KpiTile
              label="New patients"
              value={data?.patients.new}
              hint="Registered in this period"
              icon={UserPlus}
              tone="info"
              href="/patients"
              loading={loading}
            />
            <KpiTile
              label="Collected"
              value={data ? formatMoney(data.money.collectedMinor) : undefined}
              hint={
                data
                  ? data.money.refundedMinor > 0
                    ? `${formatMoney(data.money.refundedMinor)} refunded`
                    : `${formatMoney(data.money.invoicedMinor)} invoiced`
                  : undefined
              }
              icon={HandCoins}
              tone="success"
              href={`/payments?from=${range.from}&to=${range.to}`}
              loading={loading}
            />
            <KpiTile
              label="Outstanding"
              value={data ? formatMoney(data.money.outstandingMinor) : undefined}
              hint={
                data
                  ? `${data.money.outstandingInvoices} invoice${data.money.outstandingInvoices === 1 ? '' : 's'} with a balance`
                  : undefined
              }
              icon={Coins}
              tone="warning"
              href="/billing"
              loading={loading}
            />
            <KpiTile
              label="No-show rate"
              value={noShowPct}
              hint="Of appointments in this period"
              icon={UsersThree}
              tone={data && data.appointments.noShowRate >= 0.15 ? 'danger' : 'primary'}
              href="/appointments"
              loading={loading}
            />
            <KpiTile
              label="Longest average wait"
              value={longestWait ? minutes(longestWait[1]) : data ? 'None' : undefined}
              hint={
                longestWait
                  ? `At ${STATION_LABEL[longestWait[0]] ?? humanize(longestWait[0])}`
                  : data
                    ? 'No one was called from the queue'
                    : undefined
              }
              icon={Timer}
              tone="info"
              href="/queue"
              loading={loading}
            />
          </div>

          <Card>
            <CardHeader
              title="Visits and money per day"
              description={`${rangeDays(range)} day${rangeDays(range) === 1 ? '' : 's'}: visits as bars, the amount collected as a line.`}
            />
            {loading || !data ? (
              <div className="px-6 py-6">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : visits === 0 && data.money.collectedMinor === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <ChartBar size={24} className="text-fg-subtle" aria-hidden="true" />
                <p className="mt-3 text-sm text-fg-muted">No visits or payments in this period.</p>
              </div>
            ) : (
              <DayChart points={days} />
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader
                title="Where visits come from"
                description="Appointments by how they were booked."
              />
              {loading || !data ? (
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
              <CardLink href="/appointments">Open appointments</CardLink>
            </Card>

            <Card>
              <CardHeader
                title="Visits by outcome"
                description="What happened to each appointment."
              />
              {loading || !data ? (
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
              <CardLink href="/appointments">Open appointments</CardLink>
            </Card>

            <Card>
              <CardHeader
                title="Average wait by desk"
                description={
                  data
                    ? `${data.queue.tokensCalled} token${data.queue.tokensCalled === 1 ? '' : 's'} called from the queue.`
                    : undefined
                }
              />
              {loading || !data ? (
                <Loading />
              ) : (
                <BarList
                  rows={waits.map(([k, v]) => ({
                    key: k,
                    label: STATION_LABEL[k] ?? humanize(k),
                    value: v,
                    display: minutes(v),
                  }))}
                  empty="No one was called from the queue in this period."
                />
              )}
              <CardLink href="/queue">Open the queue</CardLink>
            </Card>

            <Card>
              <CardHeader
                title="Most common diagnoses"
                description="Signed-off diagnoses, by how often they were recorded."
              />
              {loading || !data ? (
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
                          <span className="tabular ml-2 font-mono text-xs text-fg-subtle">
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
              <CardLink href="/dashboard">Open consultations</CardLink>
            </Card>

            <Card>
              <CardHeader
                title="Leads"
                description="Enquiries received and turned into patients."
              />
              {loading || !data ? (
                <Loading />
              ) : (
                <dl className="grid grid-cols-2 gap-4 px-6 py-5">
                  <div>
                    <dt className="text-[13px] font-medium text-fg-muted">New leads</dt>
                    <dd className="tabular mt-1 font-mono text-2xl font-semibold text-fg">
                      {data.leads.new}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium text-fg-muted">Became patients</dt>
                    <dd className="tabular mt-1 font-mono text-2xl font-semibold text-fg">
                      {data.leads.converted}
                      {data.leads.new > 0 && (
                        <span className="ml-2 text-sm font-normal text-fg-subtle">
                          {Math.round((data.leads.converted / data.leads.new) * 100)}%
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              <CardLink href="/leads">Open leads</CardLink>
            </Card>

            <Card>
              <CardHeader
                title="Things to act on"
                description="Open items as of now, not limited to the period."
              />
              {loading || !data ? (
                <Loading />
              ) : (
                <ul className="divide-y divide-line">
                  {actions.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-6 py-3.5 text-sm hover:bg-surface-muted"
                      >
                        <item.icon
                          size={20}
                          aria-hidden="true"
                          className={`shrink-0 ${item.count > 0 ? item.tone : 'text-fg-subtle'}`}
                        />
                        <span className="flex-1 text-fg">{item.text}</span>
                        <span className="tabular font-mono font-semibold text-fg">
                          {item.count}
                        </span>
                        <ArrowRight size={16} className="text-fg-subtle" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: string }) {
  return (
    <div className="border-t border-line px-6 py-3">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-primary-hover"
      >
        {children}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
