'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserCircleMinus, WarningCircle } from '@phosphor-icons/react';
import { Card } from '../../../../components/ui/card';
import { NoAccess } from '../../../../components/ui/no-access';
import { Tabs } from '../../../../components/ui/tabs';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { PatientBanner, type HistoryEntry } from '../_components/patient-banner';
import { usePageCrumb } from '../../../../components/shell/breadcrumb';
import { fullName } from '../../../../lib/format';
import { Skeleton } from '../../../../components/ui/skeleton';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Button } from '../../../../components/ui/button';
import type { PatientDetail } from '../_components/patient-shared';
import { TabPanel, visibleTabs, type TabKey } from '../_components/record-tabs';

export default function PatientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const [tab, setTab] = useState<TabKey>('overview');
  const allowed = can(user.role, 'patient:read');
  const detail = useApi<PatientDetail>(allowed ? `/patients/${encodeURIComponent(id)}` : null);
  const patient = detail.data;
  const canClinical = can(user.role, 'patient-record:read-clinical');
  const history = useApi<HistoryEntry[]>(
    allowed && canClinical ? `/medical-history?patientId=${encodeURIComponent(id)}` : null,
  );

  usePageCrumb(patient ? fullName(patient) : undefined);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const tabs = visibleTabs(user.role);

  return (
    <div className="space-y-6">
      <Link
        href="/patients"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All patients
      </Link>

      {detail.loading && <Skeleton className="h-24 w-full" />}
      {!detail.loading && detail.errorStatus === 404 && (
        <Card>
          <EmptyState
            icon={UserCircleMinus}
            title="Patient not found"
            description="This record does not exist, or it belongs to another clinic."
            action={
              <Link href="/patients" className="text-sm font-medium text-primary">
                Back to patients
              </Link>
            }
          />
        </Card>
      )}
      {!detail.loading && detail.errorStatus !== undefined && detail.errorStatus !== 404 && (
        <Card>
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
            <p className="mt-3 text-sm text-fg">This patient record could not be loaded.</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={detail.reload}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {patient && (
        <>
          <PatientBanner
            patient={patient}
            patientId={id}
            allergies={canClinical && history.data ? history.data : undefined}
          />

          <div>
            <Tabs tabs={tabs} value={tab} onChange={setTab} label="Patient record" />
            <div role="tabpanel" className="pt-6">
              <TabPanel
                key={tab}
                tab={tab}
                patientId={id}
                patient={patient}
                role={user.role}
                history={{
                  entries: history.data,
                  loading: history.loading,
                  failed: history.errorStatus !== undefined,
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
