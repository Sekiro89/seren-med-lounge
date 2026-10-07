'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Megaphone, Stethoscope, Warning } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { canActAtStation, type QueueStationKey } from '@serenemed/permissions';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, formatTime, fullName, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { useApi } from '../../../../lib/use-api';
import { DOCTOR_STATIONS, PHASE, ageYears, formatToken, rangeFlag, type AgendaRow } from './model';

interface HistoryEntry {
  id: string;
  category: string;
  description: string;
  severity: string | null;
  status: string;
  createdAt: string;
}

interface EncounterDetail {
  id: string;
  status: string;
  vitals: Array<{
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    pulseBpm: number | null;
    spo2Percent: number | null;
    temperatureCelsius: number | null;
    bmi: number | null;
    recordedAt: string;
  }>;
  labOrders: Array<{
    items: Array<{
      id: string;
      testName: string;
      results: Array<{
        id: string;
        resultValue: string;
        unit: string | null;
        referenceRange: string | null;
        createdAt: string;
      }>;
    }>;
  }>;
}

/** The selected patient: who they are, what to watch for, and what to do next. */
export function PatientSheet({
  row,
  role,
  now,
  waitingSummary,
  onChanged,
}: {
  row: AgendaRow | undefined;
  role: StaffRole;
  now: number;
  waitingSummary: string | undefined;
  onChanged: () => void;
}) {
  const canClinical = can(role, 'patient-record:read-clinical');
  const patientId = row?.appointment.patient.id;
  const encounterId = row?.appointment.encounter?.id;
  const history = useApi<HistoryEntry[]>(
    canClinical && patientId ? `/medical-history?patientId=${patientId}` : null,
  );
  const encounter = useApi<EncounterDetail>(
    canClinical && encounterId ? `/encounters/${encounterId}` : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!row) {
    return (
      <section className="flex min-h-[320px] items-center justify-center px-10 py-6 text-sm text-fg-muted">
        Select a patient in the agenda to see their sheet.
      </section>
    );
  }

  const { appointment, queue, phase, waitMinutes } = row;
  const patient = appointment.patient;
  const token = queue?.tokenNumber ?? appointment.encounter?.queueEntry?.tokenNumber;
  const station = queue?.station;
  const tag =
    phase === 'ready' || phase === 'called' || phase === 'vitals'
      ? `${PHASE[phase].label}${waitMinutes !== undefined ? ` · waiting ${waitMinutes} min` : ''}`
      : phase === 'expected'
        ? `Expected ${formatTime(appointment.scheduledAt)}`
        : PHASE[phase].label;

  // Only the data that belongs to this patient (useApi keeps the previous
  // response while the next one loads).
  const allergies = history.data?.filter((h) => h.category === 'ALLERGY' && h.status === 'ACTIVE');
  const detail = encounter.data?.id === encounterId ? encounter.data : undefined;
  const vitals = detail?.vitals[0];
  const results = (detail?.labOrders ?? [])
    .flatMap((o) => o.items.flatMap((i) => i.results.map((r) => ({ ...r, testName: i.testName }))))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  const canCall =
    queue !== undefined &&
    station !== undefined &&
    DOCTOR_STATIONS.includes(station) &&
    queue.status === 'WAITING' &&
    canActAtStation(role, station as QueueStationKey);

  const callIn = async () => {
    if (!queue) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiClient.post(`/queue/${queue.id}/call`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That token has already moved on. The agenda has been refreshed.'
          : e instanceof ApiError && e.status === 403
            ? 'That patient is waiting at a desk you do not work at.'
            : 'That did not go through. Please try again.',
      );
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const vitalRows: Array<{ label: string; value: string; unit: string }> = [];
  if (vitals) {
    if (vitals.bloodPressureSystolic && vitals.bloodPressureDiastolic)
      vitalRows.push({
        label: 'Blood pressure',
        value: `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic}`,
        unit: 'mmHg',
      });
    if (vitals.pulseBpm)
      vitalRows.push({ label: 'Pulse', value: `${vitals.pulseBpm}`, unit: 'bpm' });
    if (vitals.spo2Percent)
      vitalRows.push({ label: 'SpO₂', value: `${vitals.spo2Percent}`, unit: '%' });
    if (vitals.bmi) vitalRows.push({ label: 'BMI', value: vitals.bmi.toFixed(1), unit: 'kg/m²' });
    if (vitals.temperatureCelsius)
      vitalRows.push({
        label: 'Temperature',
        value: vitals.temperatureCelsius.toFixed(1),
        unit: '°C',
      });
  }

  return (
    <section className="px-5 pb-6 pt-6 sm:px-10" aria-label={`Patient sheet: ${fullName(patient)}`}>
      <div className="flex items-start gap-6">
        <div className="border-r border-line pr-6">
          <p className="text-[11px] text-fg-muted">Token</p>
          <p className="tabular mt-1 font-mono text-[44px] font-medium leading-none text-fg">
            {token !== undefined ? formatToken(token) : '—'}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-fg">
              {fullName(patient)}
            </h2>
            <Badge tone={PHASE[phase].tone}>{tag}</Badge>
          </div>
          <p className="mt-1.5 text-[13px] text-fg">
            {ageYears(patient.dateOfBirth, now)} yrs · born {formatDate(patient.dateOfBirth)}
            {patient.mrn && (
              <>
                {' '}
                · MRN <span className="tabular font-mono">{patient.mrn}</span>
              </>
            )}{' '}
            · <span className="tabular font-mono">{patient.phone}</span>
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {humanize(appointment.entrySource)} · booked for{' '}
            <span className="tabular font-mono">{formatTime(appointment.scheduledAt)}</span>
            {appointment.doctor && ` · ${appointment.doctor.fullName}`}
          </p>
        </div>
      </div>

      {canClinical &&
        (history.loading && !history.data ? (
          <Skeleton className="mt-5 h-11 w-full" />
        ) : allergies && allergies.length > 0 ? (
          <div className="mt-5 flex items-center gap-3 border-b border-line border-t-2 border-t-danger py-2.5">
            <Warning size={18} className="shrink-0 text-danger-fg" aria-hidden="true" />
            <span className="w-[64px] shrink-0 text-[12px] font-semibold text-danger-fg">
              Allergy
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              {allergies.map((a) => (
                <span key={a.id} className="inline-flex items-baseline gap-2">
                  <span className="text-[14px] font-medium text-fg">{a.description}</span>
                  <span className="text-[13px] text-fg-muted">
                    {a.severity ? `${humanize(a.severity)} · ` : ''}recorded{' '}
                    {new Date(a.createdAt).getUTCFullYear()}
                  </span>
                </span>
              ))}
            </span>
          </div>
        ) : (
          <div className="section-rule mt-5 flex items-center gap-3 border-b border-line py-2.5">
            <span className="w-[18px]" />
            <span className="w-[64px] shrink-0 text-[12px] font-medium text-fg-muted">Allergy</span>
            <span className="text-[13px] text-fg-muted">None recorded</span>
          </div>
        ))}

      <div
        className={`flex gap-3 border-b border-line py-3 ${canClinical ? '' : 'section-rule mt-5'}`}
      >
        <span className="w-[18px]" />
        <span className="w-[64px] shrink-0 pt-0.5 text-[12px] font-medium text-fg-muted">
          Reason
        </span>
        <p className={appointment.notes ? 'text-[15px] text-fg' : 'text-[13px] text-fg-muted'}>
          {appointment.notes ? `“${appointment.notes}”` : 'No reason given at booking'}
        </p>
      </div>

      {canClinical && encounterId && (
        <>
          <div className="mt-5 flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-fg">Vitals</h3>
            {vitals && (
              <p className="text-[12px] text-fg-muted">
                Taken at <span className="tabular font-mono">{formatTime(vitals.recordedAt)}</span>
              </p>
            )}
          </div>
          {encounter.loading && !detail ? (
            <Skeleton className="mt-2 h-20 w-full" />
          ) : vitalRows.length === 0 && results.length === 0 ? (
            <p className="mt-2 border-t border-line py-3 text-[13px] text-fg-muted">
              Not taken yet.
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-10 border-b border-line text-[13px]">
              {vitalRows.map((v) => (
                <div key={v.label} className="flex h-10 items-center border-t border-line">
                  <dt className="w-28 text-fg-muted">{v.label}</dt>
                  <dd className="tabular font-mono text-[15px] text-fg">{v.value}</dd>
                  <dd className="ml-2 text-[12px] text-fg-muted">{v.unit}</dd>
                </div>
              ))}
              {results.map((r) => {
                const flag = rangeFlag(r.resultValue, r.referenceRange);
                return (
                  <div
                    key={r.id}
                    className="col-span-2 flex h-10 items-center border-t border-line"
                  >
                    <dt className="w-28 truncate text-fg-muted">{r.testName}</dt>
                    <dd
                      className={`tabular font-mono text-[15px] ${flag ? 'text-warning-fg' : 'text-fg'}`}
                    >
                      {r.resultValue}
                    </dd>
                    <dd className="ml-2 text-[12px] text-fg-muted">
                      {[
                        r.unit,
                        formatTime(r.createdAt),
                        r.referenceRange && `normal ${r.referenceRange}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </dd>
                    {flag && (
                      <dd className="ml-auto text-[12px] font-semibold text-warning-fg">{flag}</dd>
                    )}
                  </div>
                );
              })}
            </dl>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {canCall && (
          <Button onClick={callIn} loading={busy} icon={<Megaphone size={18} aria-hidden="true" />}>
            Call in
          </Button>
        )}
        {encounterId && canClinical && (
          <Link
            href={`/encounters/${encounterId}`}
            className="inline-flex h-10 items-center gap-2 rounded-control border border-fg px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
          >
            <Stethoscope size={18} aria-hidden="true" />
            Open consultation
          </Link>
        )}
        <Link
          href={`/patients/${patient.id}`}
          className="inline-flex h-10 items-center px-3 text-sm font-medium text-fg hover:text-primary"
        >
          Full record
        </Link>
        {waitingSummary && (
          <span className="tabular ml-auto font-mono text-[12px] text-fg-muted">
            {waitingSummary}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger-fg">
          {error}
        </p>
      )}
    </section>
  );
}
