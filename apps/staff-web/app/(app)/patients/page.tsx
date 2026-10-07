'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { RuledTable } from '../../../components/ui/ruled-table';
import { SearchBox } from '../../../components/ui/search-box';
import { Figures, InkSheet, SheetBar, SheetHead } from '../../../components/ui/ink';
import { formatDate, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { RegisterPatientDialog } from './_components/register-dialog';
import {
  ageLabel,
  formatPhone,
  sexLetter,
  type PatientSummary,
} from './_components/patient-shared';

/** GET /patients returns at most this many rows (newest first). */
const API_LIMIT = 20;

export default function PatientsPage() {
  return (
    <Suspense>
      <PatientsDesk />
    </Suspense>
  );
}

function PatientsDesk() {
  const user = useStaff();
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams().get('q')?.trim() ?? '';
  const [text, setText] = useState(q);
  const [registering, setRegistering] = useState(false);
  const lastQ = useRef(q);

  const allowed = can(user.role, 'patient:read');
  const canRegister = can(user.role, 'patient:write');
  const { data, loading, errorStatus, reload } = useApi<PatientSummary[]>(
    allowed ? `/patients${q ? `?q=${encodeURIComponent(q)}` : ''}` : null,
  );

  // The top bar can change ?q= while this page is open: follow it.
  useEffect(() => {
    if (q !== lastQ.current) {
      lastQ.current = q;
      setText(q);
    }
  }, [q]);

  // Debounce typing into the URL, so a search can be shared and survives reload.
  useEffect(() => {
    const next = text.trim();
    if (next === lastQ.current) return;
    const timer = window.setTimeout(() => {
      lastQ.current = next;
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, pathname, router]);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const columns: Column<PatientSummary>[] = [
    {
      header: 'Patient no.',
      render: (p) =>
        p.mrn ? (
          <span className="tabular font-mono text-[13px] text-fg-muted">{p.mrn}</span>
        ) : (
          <span className="text-[13px] text-fg-subtle">Not issued</span>
        ),
      className: 'w-36 whitespace-nowrap',
    },
    {
      header: 'Patient',
      render: (p) => (
        <Link href={`/patients/${p.id}`} className="group block rounded-control leading-tight">
          <span className="block font-medium text-fg group-hover:text-primary">{fullName(p)}</span>
          <span className="mt-0.5 block text-xs text-fg-muted">
            {[sexLetter(p.sex), ageLabel(p.dateOfBirth)].filter(Boolean).join(' · ')}
          </span>
        </Link>
      ),
    },
    {
      header: 'Born',
      numeric: true,
      render: (p) => <span className="text-[13px]">{formatDate(p.dateOfBirth)}</span>,
      className: 'whitespace-nowrap',
    },
    {
      header: 'Phone',
      numeric: true,
      render: (p) => <span className="text-[13px]">{formatPhone(p.phone)}</span>,
      className: 'whitespace-nowrap',
    },
    {
      header: 'Email',
      render: (p) =>
        p.email ? (
          <span className="text-[13px] text-fg-muted">{p.email}</span>
        ) : (
          <span className="text-[13px] text-fg-subtle">Not given</span>
        ),
    },
    {
      header: 'Record',
      align: 'right',
      render: (p) => (
        <Link
          href={`/patients/${p.id}`}
          aria-label={`Open record for ${fullName(p)}`}
          className="whitespace-nowrap text-[13px] font-medium text-primary hover:text-primary-hover"
        >
          Open record
        </Link>
      ),
    },
  ];

  const register = canRegister ? (
    <Button icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => setRegistering(true)}>
      Register patient
    </Button>
  ) : undefined;

  return (
    <>
      <InkSheet>
        <SheetHead
          eyebrow="Front desk"
          title="Patients"
          description="Find a patient by name, phone or patient number, or register someone new."
          figures={
            <Figures
              loading={loading && !data}
              items={[
                {
                  label: q ? 'Matches' : 'Showing',
                  value: data
                    ? data.length >= API_LIMIT
                      ? `${API_LIMIT}+`
                      : data.length
                    : undefined,
                },
              ]}
            />
          }
          action={register}
        />
        <SheetBar
          actions={
            <span className="text-[13px] text-fg-muted">
              {q ? (
                <>
                  Results for <span className="font-medium text-fg">&ldquo;{q}&rdquo;</span>
                </>
              ) : (
                'Newest registrations first'
              )}
            </span>
          }
        >
          <SearchBox
            aria-label="Search patients by name, phone or patient number"
            placeholder="Name, phone or SM- number"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-96 max-w-full"
          />
        </SheetBar>

        {errorStatus !== undefined && !loading ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
            <p className="mt-3 text-sm text-fg">The patient list could not be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : (
          <RuledTable
            columns={columns}
            rows={data}
            getRowKey={(p) => p.id}
            loading={loading}
            onRowClick={(p) => router.push(`/patients/${p.id}`)}
            rowLabel={(p) => `Open record for ${fullName(p)}`}
            capNotice={
              data && data.length >= API_LIMIT
                ? `Showing the ${API_LIMIT} most recent matches. Type more of the name, phone or patient number to narrow the list.`
                : undefined
            }
            empty={
              q ? (
                <EmptyState
                  icon={UsersThree}
                  title={`No patients match "${q}"`}
                  description="Check the spelling, or search by the phone number instead."
                  action={
                    register && (
                      <Button
                        variant="secondary"
                        icon={<UserPlus size={18} aria-hidden="true" />}
                        onClick={() => setRegistering(true)}
                      >
                        Register patient
                      </Button>
                    )
                  }
                />
              ) : (
                <EmptyState
                  icon={UsersThree}
                  title="No patients yet"
                  description="Patients appear here once they are registered."
                  action={register}
                />
              )
            }
          />
        )}
      </InkSheet>

      {canRegister && (
        <RegisterPatientDialog
          open={registering}
          onClose={() => setRegistering(false)}
          onRegistered={reload}
        />
      )}
    </>
  );
}
