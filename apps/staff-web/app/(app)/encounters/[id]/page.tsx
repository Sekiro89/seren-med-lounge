'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { CaretLeft, SignOut, Warning, WarningCircle } from '@phosphor-icons/react';
import { Avatar } from '../../../../components/ui/avatar';
import { Badge, StatusBadge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { NoAccess } from '../../../../components/ui/no-access';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { Tabs } from '../../../../components/ui/tabs';
import { formatDate, formatTime, fullName, humanize } from '../../../../lib/format';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { VitalsSection } from './vitals-section';
import { DiagnosesSection } from './diagnoses-section';
import { PrescriptionsSection } from './prescriptions-section';
import { LabOrdersSection } from './lab-orders-section';
import { MetabolicSection } from './metabolic-section';
import { NotesSection } from './notes-section';
import { ProceduresSection, ReferralsSection } from './readonly-sections';
import { apiErrorMessage, type EncounterDetail, type PatientInfo } from './types';
import { isUnsigned } from './types';
import { Dialog } from '../../../../components/ui/dialog';
import { apiClient } from '../../../../lib/api-client';

interface HistoryEntry {
  id: string;
  category: string;
  description: string;
  severity: string | null;
  status: string;
}

type TabKey = 'assessment' | 'orders' | 'care';

function ageFrom(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Sticky patient banner (design system section 8): who this is, always visible. */
function PatientBanner({
  encounter,
  patient,
  allergies,
  allergiesLoaded,
}: {
  encounter: EncounterDetail;
  patient: PatientInfo | undefined;
  allergies: HistoryEntry[] | undefined;
  allergiesLoaded: boolean;
}) {
  const name = patient ? fullName(patient) : 'Patient record';
  return (
    <div className="sticky top-0 z-10 mb-6">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={name} size={40} />
            <div className="leading-tight">
              <p className="text-base font-semibold text-fg">{name}</p>
              {patient && (
                <p className="tabular text-[13px] text-fg-muted">
                  {ageFrom(patient.dateOfBirth)} years · Date of birth{' '}
                  {formatDate(patient.dateOfBirth)} · {patient.phone}
                </p>
              )}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {encounter.queueEntry && (
              <Badge tone="info">Token {encounter.queueEntry.tokenNumber}</Badge>
            )}
            <Badge tone={encounter.status === 'OPEN' ? 'info' : 'neutral'}>
              {humanize(encounter.status)}
            </Badge>
          </div>
        </div>
        {allergiesLoaded && (
          <div
            className={`flex flex-wrap items-center gap-2 border-t border-line px-5 py-2 text-[13px] ${
              allergies && allergies.length > 0 ? 'bg-danger-bg' : 'bg-surface-muted'
            }`}
          >
            {allergies && allergies.length > 0 ? (
              <>
                <Warning size={16} className="text-danger-fg" aria-hidden="true" />
                <span className="font-semibold text-danger-fg">Allergies</span>
                {allergies.map((a) => (
                  <Badge key={a.id} tone="danger">
                    {a.description}
                    {a.severity ? `, ${humanize(a.severity).toLowerCase()}` : ''}
                  </Badge>
                ))}
              </>
            ) : (
              <span className="text-fg-muted">No allergies recorded</span>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * The doctor consultation workspace. One page, independently permissioned
 * sections, each posting straight to its endpoint. `use()` unwraps
 * `params` because it is a Promise as of Next.js 15+.
 */
export default function EncounterWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const [tab, setTab] = useState<TabKey>('assessment');
  const [discharging, setDischarging] = useState(false);
  const [dischargeBusy, setDischargeBusy] = useState(false);
  const [dischargeError, setDischargeError] = useState<string>();

  const allowed = can(user.role, 'patient-record:read-clinical');
  const {
    data: encounter,
    errorStatus,
    reload,
  } = useApi<EncounterDetail>(allowed ? `/encounters/${id}` : null);

  // The encounter detail does not include the patient (API gap), so look
  // the patient up in the patient list by id when the role may read it.
  const needsPatientLookup =
    allowed && !!encounter && !encounter.patient && can(user.role, 'patient:read');
  const { data: patients } = useApi<PatientInfo[]>(needsPatientLookup ? '/patients' : null);
  const patient = encounter?.patient ?? patients?.find((p) => p.id === encounter?.patientId);

  const {
    data: history,
    loading: historyLoading,
    errorStatus: historyError,
  } = useApi<HistoryEntry[]>(
    allowed && encounter ? `/medical-history?patientId=${encounter.patientId}` : null,
  );
  const allergies = history?.filter((h) => h.category === 'ALLERGY' && h.status === 'ACTIVE');

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  if (errorStatus !== undefined && !encounter) {
    return (
      <>
        <PageHeader title="Consultation" />
        <Card>
          {errorStatus === 403 ? (
            <NoAccess homeHref={homeFor(user.role)} />
          ) : (
            <div role="alert" className="flex items-center justify-between gap-4 p-5">
              <p className="text-sm text-danger-fg">
                {errorStatus === 404 ? 'This visit was not found.' : 'Could not load this visit.'}
              </p>
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            </div>
          )}
        </Card>
      </>
    );
  }

  if (!encounter) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="mb-6 h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const role = user.role;
  const closed = encounter.status !== 'OPEN';
  // Design system 8.3: a visit with unsigned drafts says so at the top, not only per row.
  const unsignedCount =
    encounter.clinicalNotes.filter((n) => isUnsigned(n.status)).length +
    encounter.diagnoses.filter((dx) => isUnsigned(dx.status)).length;
  const patientName = patient ? fullName(patient) : 'this patient';
  const draftCount =
    encounter.clinicalNotes.filter((n) => n.status === 'DRAFT' || n.status === 'AI_DRAFT').length +
    encounter.diagnoses.filter((d) => d.status === 'DRAFT' || d.status === 'AI_DRAFT').length;

  const discharge = async () => {
    setDischargeBusy(true);
    setDischargeError(undefined);
    try {
      await apiClient.post(`/encounters/${encounter.id}/discharge`, {});
      setDischarging(false);
      reload();
    } catch (error) {
      setDischargeError(apiErrorMessage(error, 'Could not close this visit.'));
    } finally {
      setDischargeBusy(false);
    }
  };

  const tabs = [
    {
      key: 'assessment' as const,
      label: 'Assessment',
      count: encounter.vitals.length + encounter.diagnoses.length + encounter.clinicalNotes.length,
    },
    {
      key: 'orders' as const,
      label: 'Orders',
      count: encounter.prescriptions.length + encounter.labOrders.length,
    },
    {
      key: 'care' as const,
      label: 'Referrals and procedures',
      count: encounter.referrals.length + encounter.procedures.length,
    },
  ];

  return (
    <>
      <Link
        href="/dashboard"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
      >
        <CaretLeft size={16} aria-hidden="true" />
        Consultations
      </Link>
      <PageHeader
        title={patient ? `Consultation with ${fullName(patient)}` : 'Consultation'}
        description={`Started ${formatDate(encounter.startedAt)} ${formatTime(encounter.startedAt)}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge
              domain="appointment"
              status={encounter.status === 'OPEN' ? 'IN_PROGRESS' : 'COMPLETED'}
            />
            {!closed && can(role, 'patient-record:write-clinical') && (
              <Button
                variant="secondary"
                icon={<SignOut size={18} aria-hidden="true" />}
                onClick={() => {
                  setDischargeError(undefined);
                  setDischarging(true);
                }}
              >
                Discharge
              </Button>
            )}
          </div>
        }
      />

      <PatientBanner
        encounter={encounter}
        patient={patient}
        allergies={allergies}
        allergiesLoaded={!historyLoading && historyError === undefined && history !== undefined}
      />

      {encounter.registration && (
        <p className="mb-4 text-[13px] text-fg-muted">
          {humanize(encounter.registration.visitType)} ·{' '}
          {humanize(encounter.registration.consultationRoute)}
          {encounter.registration.cancerScreeningRequired ? ' · Cancer screening required' : ''}
          {encounter.registration.notes ? ` · ${encounter.registration.notes}` : ''}
        </p>
      )}

      {!closed && unsignedCount > 0 && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-control bg-warning-bg px-4 py-2.5 text-sm text-warning-fg"
        >
          <WarningCircle size={18} aria-hidden="true" />
          {unsignedCount === 1
            ? 'One record on this visit is still a draft. A senior doctor must sign it off before discharge.'
            : `${unsignedCount} records on this visit are still drafts. A senior doctor must sign them off before discharge.`}
        </p>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Consultation sections" />

      <div role="tabpanel" className="mt-6 flex flex-col gap-6">
        {tab === 'assessment' && (
          <>
            <VitalsSection
              encounterId={encounter.id}
              vitals={encounter.vitals}
              role={closed ? undefined : role}
              onChange={reload}
            />
            <MetabolicSection
              encounterId={encounter.id}
              workups={encounter.metabolicWorkups}
              role={role}
              closed={closed}
              onChange={reload}
            />
            <NotesSection
              encounterId={encounter.id}
              notes={encounter.clinicalNotes}
              role={role}
              patientName={patientName}
              closed={closed}
              onChange={reload}
            />
            <DiagnosesSection
              encounterId={encounter.id}
              diagnoses={encounter.diagnoses}
              role={closed ? undefined : role}
              onChange={reload}
            />
          </>
        )}
        {tab === 'orders' && (
          <>
            <PrescriptionsSection
              encounterId={encounter.id}
              prescriptions={encounter.prescriptions}
              role={closed ? undefined : role}
              onChange={reload}
            />
            <LabOrdersSection
              encounterId={encounter.id}
              labOrders={encounter.labOrders}
              role={closed ? undefined : role}
              onChange={reload}
            />
          </>
        )}
        {tab === 'care' && (
          <>
            <ReferralsSection referrals={encounter.referrals} />
            <ProceduresSection procedures={encounter.procedures} />
          </>
        )}
      </div>

      <Dialog
        open={discharging}
        onClose={() => !dischargeBusy && setDischarging(false)}
        title="Discharge patient"
        description={`Close this visit for ${patientName}? The appointment is marked completed and the queue token is closed. Notes and diagnoses stay on record; nothing more can be added to this visit.`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDischarging(false)}
              disabled={dischargeBusy}
            >
              Keep visit open
            </Button>
            <Button loading={dischargeBusy} onClick={discharge}>
              Discharge patient
            </Button>
          </>
        }
      >
        {draftCount > 0 ? (
          <p className="rounded-control bg-warning-bg px-3 py-2 text-sm text-warning-fg">
            {draftCount} unsigned draft{draftCount === 1 ? '' : 's'} on this visit. Sign them off
            first, or the discharge is refused.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Everything on this visit is signed off.</p>
        )}
        {dischargeError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {dischargeError}
          </p>
        )}
      </Dialog>
    </>
  );
}
