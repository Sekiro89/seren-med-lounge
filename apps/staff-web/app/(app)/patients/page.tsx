'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { PersonCell } from '../../../components/ui/avatar';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { SearchBox } from '../../../components/ui/search-box';
import { Toolbar } from '../../../components/ui/toolbar';
import { formatDate, fullName } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { RegisterPatientDialog } from './_components/register-dialog';
import { ageLabel, type PatientSummary } from './_components/patient-shared';

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
      header: 'Patient',
      render: (p) => (
        <Link href={`/patients/${p.id}`} className="block rounded-control hover:text-primary">
          <PersonCell
            name={fullName(p)}
            sub={`${ageLabel(p.dateOfBirth)} · Born ${formatDate(p.dateOfBirth)}`}
          />
        </Link>
      ),
    },
    { header: 'Phone', render: (p) => <span className="tabular font-mono">{p.phone}</span> },
    {
      header: 'Email',
      render: (p) => p.email ?? <span className="text-fg-subtle">Not given</span>,
    },
    {
      header: 'Record',
      align: 'right',
      render: (p) => (
        <Link
          href={`/patients/${p.id}`}
          aria-label={`Open record for ${fullName(p)}`}
          className="text-[13px] font-medium text-primary hover:text-primary-hover"
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
      <PageHeader
        title="Patients"
        description="Find a patient by name or phone number, or register someone new."
        action={register}
      />

      <Card>
        <Toolbar>
          <SearchBox
            aria-label="Search patients by name or phone"
            placeholder="Search by name or phone"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-80 max-w-full"
          />
        </Toolbar>

        {errorStatus !== undefined && !loading ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
            <p className="mt-3 text-sm text-fg">The patient list could not be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={data}
            getRowKey={(p) => p.id}
            loading={loading}
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

        {data && data.length >= API_LIMIT && (
          <p className="border-t border-line px-5 py-3 text-[13px] text-fg-muted">
            Showing the {API_LIMIT} most recent matches. Type more of the name or phone number to
            narrow the list.
          </p>
        )}
      </Card>

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
