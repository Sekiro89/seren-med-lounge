'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@serenemed/ui';
import { ApiError } from '@serenemed/api-client';
import { apiClient } from '../../lib/api-client';
import { clearPatientToken, getPatientToken } from '../../lib/auth';
import {
  AppointmentsSection,
  DiagnosesSection,
  LabOrdersSection,
  PrescriptionsSection,
} from './records';
import type {
  AppointmentSummary,
  DiagnosisSummary,
  LabOrderSummary,
  PrescriptionSummary,
} from './types';

interface PatientProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  dateOfBirth: string;
}

interface DashboardData {
  profile: PatientProfile;
  appointments: AppointmentSummary[];
  diagnoses: DiagnosisSummary[];
  prescriptions: PrescriptionSummary[];
  labOrders: LabOrderSummary[];
}

/**
 * The patient's own view of everything staff-web can create for them —
 * appointments, diagnoses (finalized only — see
 * DiagnosesService.listForPatient), prescriptions, lab results. Built
 * mobile-first deliberately: this is the surface patients actually open
 * on a phone, not a desk-bound staff dashboard, so the layout is a
 * single narrow column of stacked cards throughout (no tables, no
 * side-by-side panels that would need to reflow), tap targets sized for
 * a thumb, and no assumption of a wide viewport anywhere in this file.
 */
export default function PatientDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getPatientToken()) {
      router.replace('/login');
      return;
    }

    Promise.all([
      apiClient.get<PatientProfile>('/patients/me'),
      apiClient.get<AppointmentSummary[]>('/patients/me/appointments'),
      apiClient.get<DiagnosisSummary[]>('/patients/me/diagnoses'),
      apiClient.get<PrescriptionSummary[]>('/patients/me/prescriptions'),
      apiClient.get<LabOrderSummary[]>('/patients/me/lab-orders'),
    ])
      .then(([profile, appointments, diagnoses, prescriptions, labOrders]) => {
        setData({ profile, appointments, diagnoses, prescriptions, labOrders });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearPatientToken();
          router.replace('/login');
          return;
        }
        setLoadError('Could not load your records. Please try again.');
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
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
        <p className="text-sm text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 bg-slate-50 px-4 py-6">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">
            Hi, {data.profile.firstName}
          </h1>
          <p className="text-xs text-slate-500">{data.profile.phone}</p>
        </div>
        <Button variant="secondary" onClick={handleLogout} className="shrink-0 px-3 py-2.5 text-sm">
          Sign out
        </Button>
      </header>

      <AppointmentsSection appointments={data.appointments} />
      <DiagnosesSection diagnoses={data.diagnoses} />
      <PrescriptionsSection prescriptions={data.prescriptions} />
      <LabOrdersSection labOrders={data.labOrders} />
    </main>
  );
}
