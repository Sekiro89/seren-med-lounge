'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { clearPatientToken, getPatientToken } from '../../lib/auth';

interface PatientProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  dateOfBirth: string;
}

/**
 * Proves the login is actually load-bearing (not just "a form that
 * posts somewhere") by fetching GET /patients/me with the stored token —
 * a route that only succeeds for an authenticated patient, scoped to
 * their own record (apps/api/src/patients/patients.controller.ts).
 */
export default function PatientDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getPatientToken()) {
      router.replace('/login');
      return;
    }

    apiClient
      .get<PatientProfile>('/patients/me')
      .then(setProfile)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearPatientToken();
          router.replace('/login');
          return;
        }
        setLoadError('Could not load your profile. Please try again.');
      });
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/patient/logout');
    } finally {
      clearPatientToken();
      router.replace('/login');
    }
  };

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-slate-50 px-6 py-16">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Welcome, {profile.firstName}</h1>
        <p className="mb-4 text-sm text-slate-600">
          Patient interface — architecture scaffold. Appointments, records, and prescriptions are
          added as their backend modules ship.
        </p>
        <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd className="text-slate-900">
            {profile.firstName} {profile.lastName}
          </dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-900">{profile.email ?? '—'}</dd>
          <dt className="text-slate-500">Phone</dt>
          <dd className="text-slate-900">{profile.phone}</dd>
        </dl>
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          Sign out
        </Button>
      </Card>
    </main>
  );
}
