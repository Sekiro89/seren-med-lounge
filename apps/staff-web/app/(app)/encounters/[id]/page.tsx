'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../../lib/api-client';
import { clearStaffSession, getStaffToken, getStaffUser, type StaffUser } from '../../../lib/auth';
import { VitalsSection } from './vitals-section';
import { DiagnosesSection } from './diagnoses-section';
import { PrescriptionsSection } from './prescriptions-section';
import { LabOrdersSection } from './lab-orders-section';
import type { EncounterDetail } from './types';

/**
 * The doctor consultation workspace — the vertical slice this UI push
 * was built around. One page, four independently-permissioned sections
 * (vitals/diagnoses/prescriptions/lab orders), each posting straight to
 * the real endpoints built and e2e-tested earlier this session. `use()`
 * unwraps `params` because it's a Promise as of Next.js 15+ — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md.
 */
export default function EncounterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reused by the four sections' onChange (post-mutation refresh) — not
  // called from the mount effect below; see dashboard/page.tsx's
  // identical comment for why (react-hooks/set-state-in-effect flags
  // calling a named async function from an effect, even through a
  // promise chain).
  const load = useCallback(async () => {
    try {
      const detail = await apiClient.get<EncounterDetail>(`/encounters/${id}`);
      setEncounter(detail);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearStaffSession();
        router.replace('/login');
        return;
      }
      setLoadError('Could not load this encounter. Please try again.');
    }
  }, [id, router]);

  useEffect(() => {
    if (!getStaffToken()) {
      router.replace('/login');
      return;
    }

    apiClient
      .get<EncounterDetail>(`/encounters/${id}`)
      .then((detail) => {
        setUser(getStaffUser());
        setEncounter(detail);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearStaffSession();
          router.replace('/login');
          return;
        }
        setLoadError('Could not load this encounter. Please try again.');
      });
  }, [id, router]);

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!encounter) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 bg-slate-50 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Encounter</h1>
          <p className="text-sm text-slate-600">
            Status: {encounter.status} · Started {new Date(encounter.startedAt).toLocaleString()}
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push('/dashboard')}>
          ← Dashboard
        </Button>
      </header>

      <VitalsSection
        encounterId={encounter.id}
        vitals={encounter.vitals}
        role={user?.role}
        onChange={load}
      />
      <DiagnosesSection
        encounterId={encounter.id}
        diagnoses={encounter.diagnoses}
        role={user?.role}
        onChange={load}
      />
      <PrescriptionsSection
        encounterId={encounter.id}
        prescriptions={encounter.prescriptions}
        role={user?.role}
        onChange={load}
      />
      <LabOrdersSection
        encounterId={encounter.id}
        labOrders={encounter.labOrders}
        role={user?.role}
        onChange={load}
      />
    </main>
  );
}
