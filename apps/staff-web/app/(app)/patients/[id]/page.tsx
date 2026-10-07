'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { CaretLeft, UserCircleMinus, WarningCircle } from '@phosphor-icons/react';
import { Card } from '../../../../components/ui/card';
import { NoAccess } from '../../../../components/ui/no-access';
import { Tabs } from '../../../../components/ui/tabs';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { PatientLetterhead, type HistoryEntry } from '../_components/patient-banner';
import { usePageCrumb } from '../../../../components/shell/breadcrumb';
import { formatDate, fullName } from '../../../../lib/format';
import { Skeleton } from '../../../../components/ui/skeleton';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Button } from '../../../../components/ui/button';
import { InkSheet } from '../../../../components/ui/ink';
import { MarginLabel, SheetAligned, SheetRow } from '../../../../components/ui/sheet';
import type { PatientDetail } from '../_components/patient-shared';
import { TabPanel, visibleTabs, type TabKey } from '../_components/record-tabs';

/**
 * The patient record as a document, a sibling of the consultation page
 * (design system 14a): letterhead with the allergy rule, the record's
 * sections as tabs on the same sheet, and quiet margin notes on the left.
 */
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
  const historyState = {
    entries: history.data,
    loading: history.loading,
    failed: history.errorStatus !== undefined,
  };

  return (
    <div className="@container min-w-0">
      <div className="mx-auto max-w-[1040px]">
        <SheetAligned className="mb-3">
          <Link
            href="/patients"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-primary-hover"
          >
            <CaretLeft size={16} aria-hidden="true" />
            All patients
          </Link>
        </SheetAligned>

        {detail.loading && (
          <SheetAligned>
            <InkSheet className="flex flex-col gap-3 px-10 py-8">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </InkSheet>
          </SheetAligned>
        )}
        {!detail.loading && detail.errorStatus === 404 && (
          <SheetAligned>
            <InkSheet>
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
            </InkSheet>
          </SheetAligned>
        )}
        {!detail.loading && detail.errorStatus !== undefined && detail.errorStatus !== 404 && (
          <SheetAligned>
            <InkSheet>
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <WarningCircle size={24} className="text-danger-fg" aria-hidden="true" />
                <p className="mt-3 text-sm text-fg">This patient record could not be loaded.</p>
                <Button variant="secondary" size="sm" className="mt-4" onClick={detail.reload}>
                  Try again
                </Button>
              </div>
            </InkSheet>
          </SheetAligned>
        )}

        {patient && (
          <article aria-label={`Patient record for ${fullName(patient)}`}>
            <SheetRow
              first
              marginClassName="pt-7"
              margin={
                <>
                  <MarginLabel>Record</MarginLabel>
                  <p className="mt-1">
                    Since <span className="font-mono text-fg">{formatDate(patient.createdAt)}</span>
                  </p>
                  {!canClinical && (
                    <p className="mt-2">Clinical history is kept for doctors and nurses.</p>
                  )}
                </>
              }
            >
              <PatientLetterhead
                patient={patient}
                history={canClinical ? historyState : undefined}
              />
            </SheetRow>

            <SheetRow>
              <Tabs tabs={tabs} value={tab} onChange={setTab} label="Patient record" />
            </SheetRow>

            <div role="tabpanel" aria-label={tabs.find((t) => t.key === tab)?.label}>
              <TabPanel
                key={tab}
                tab={tab}
                patientId={id}
                patient={patient}
                role={user.role}
                history={historyState}
                onTab={setTab}
              />
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
