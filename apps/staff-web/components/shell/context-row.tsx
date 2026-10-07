'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Buildings } from '@phosphor-icons/react';
import { findNavItem } from '../../lib/nav';
import { useApi } from '../../lib/use-api';
import { useCurrentCrumb } from './breadcrumb';

const CLINIC_TZ = 'Asia/Kolkata';

interface ClinicHoursToday {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

/** `Wednesday 7 October 2026` and `19:02`, clinic time. */
function clinicNow(date: Date) {
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(date)
    .replace(',', '');
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return { day, time };
}

/** The clinic-time clock, re-rendered on each minute boundary. */
function useClinicClock() {
  // The shell only mounts on the client (after the session is read), so
  // reading the time in the initialiser can't cause a hydration mismatch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: number | undefined;
    const timeout = window.setTimeout(
      () => {
        setNow(new Date());
        interval = window.setInterval(() => setNow(new Date()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  return clinicNow(now);
}

function Divider() {
  return <span aria-hidden="true" className="h-3 w-px shrink-0 bg-control" />;
}

/**
 * The 40px row under the top bar (design system 6.1): clinic, date,
 * clinic-time clock, the breadcrumb on detail pages, and whether the
 * clinic is open. The open status is left out quietly if the hours
 * endpoint is missing or fails.
 */
export function ContextRow({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();
  const { day, time } = useClinicClock();
  const hours = useApi<ClinicHoursToday>('/clinic/hours/today', 300_000);
  const item = findNavItem(pathname);
  const crumb = useCurrentCrumb();
  const isDetail = item && pathname !== item.href;

  const status = hours.errorStatus === undefined ? hours.data : undefined;

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex h-10 max-w-[1440px] items-center gap-4 px-5 text-[13px] text-fg-muted lg:px-10">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-fg">
          <Buildings size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />
          <span className="truncate">{clinicName}</span>
        </span>
        <Divider />
        <span className="hidden whitespace-nowrap sm:inline">{day}</span>
        <span className="hidden sm:contents">
          <Divider />
        </span>
        <span className="whitespace-nowrap font-mono text-fg">
          <time aria-label={`Clinic time ${time}`}>{time}</time> IST
        </span>
        {isDetail && (
          <>
            <Divider />
            <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
              <ol className="flex min-w-0 items-center gap-1.5">
                <li>
                  <Link href={item.href} className="hover:text-fg hover:underline">
                    {item.label}
                  </Link>
                </li>
                {crumb && (
                  <>
                    <li aria-hidden="true" className="text-fg-subtle">
                      /
                    </li>
                    <li aria-current="page" className="truncate text-fg">
                      {crumb}
                    </li>
                  </>
                )}
              </ol>
            </nav>
          </>
        )}
        {status && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden="true"
              className={`size-1.5 ${status.isOpen ? 'bg-success-fg' : 'bg-fg-subtle'}`}
            />
            {status.isOpen ? (
              <span>
                Clinic open
                {status.closesAt && (
                  <>
                    {' '}
                    until <span className="font-mono text-fg">{status.closesAt}</span>
                  </>
                )}
              </span>
            ) : (
              <span>
                Closed
                {status.opensAt && (
                  <>
                    {' '}
                    · opens <span className="font-mono text-fg">{status.opensAt}</span>
                  </>
                )}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
