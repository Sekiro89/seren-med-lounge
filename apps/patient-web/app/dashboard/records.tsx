import { Card } from '@serenemed/ui';
import type {
  AppointmentSummary,
  DiagnosisSummary,
  LabOrderSummary,
  PrescriptionSummary,
} from './types';

/**
 * Four read-only sections — the patient-facing half of the same data
 * staff-web's encounter workspace writes (see
 * apps/api/src/patients/patients.controller.ts's /patients/me/* routes).
 * No forms, no mutations: a patient can see their own record here, not
 * edit it. Mobile-first layout throughout (stacked rows, not tables —
 * this is the primary surface patients actually use on a phone, unlike
 * staff-web's desk-bound dashboard).
 */

function StatusPill({ status }: { status: string }) {
  return (
    <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      {status}
    </span>
  );
}

export function AppointmentsSection({ appointments }: { appointments: AppointmentSummary[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Appointments</h2>
      {appointments.length === 0 ? (
        <p className="text-sm text-slate-500">No appointments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {new Date(appointment.scheduledAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  {appointment.entrySource.replaceAll('_', ' ')}
                </p>
              </div>
              <StatusPill status={appointment.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DiagnosesSection({ diagnoses }: { diagnoses: DiagnosisSummary[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Diagnoses</h2>
      {diagnoses.length === 0 ? (
        <p className="text-sm text-slate-500">No diagnoses on file yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {diagnoses.map((diagnosis) => {
            const latest = diagnosis.versions[0];
            return (
              <li key={diagnosis.id} className="rounded-md bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{latest.description}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  {latest.icdCode && <span>{latest.icdCode}</span>}
                  <span>{new Date(latest.createdAt).toLocaleDateString()}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PrescriptionsSection({ prescriptions }: { prescriptions: PrescriptionSummary[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Prescriptions</h2>
      {prescriptions.length === 0 ? (
        <p className="text-sm text-slate-500">No prescriptions yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {prescriptions.map((prescription) => (
            <li key={prescription.id} className="rounded-md bg-slate-50 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {new Date(prescription.createdAt).toLocaleDateString()}
                </span>
                <StatusPill status={prescription.status} />
              </div>
              <ul className="flex flex-col gap-1">
                {prescription.items.map((item) => (
                  <li key={item.id} className="text-sm text-slate-900">
                    {item.medicationName} — {item.dosage}, {item.frequency}
                    {item.durationDays ? ` for ${item.durationDays}d` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LabOrdersSection({ labOrders }: { labOrders: LabOrderSummary[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Lab results</h2>
      {labOrders.length === 0 ? (
        <p className="text-sm text-slate-500">No lab tests ordered yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {labOrders.map((order) => (
            <li key={order.id} className="rounded-md bg-slate-50 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <StatusPill status={order.status} />
              </div>
              <ul className="flex flex-col gap-1.5">
                {order.items.map((item) => {
                  const latestResult = item.results[item.results.length - 1];
                  return (
                    <li key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-900">{item.testName}</span>
                      <span className="text-slate-500">
                        {latestResult
                          ? `${latestResult.resultValue}${latestResult.unit ? ` ${latestResult.unit}` : ''}`
                          : 'Pending'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
