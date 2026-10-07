'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Megaphone, Plus, UsersThree } from '@phosphor-icons/react';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import {
  Figures,
  InkSection,
  InkSheet,
  LedgerLine,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../../components/ui/ink';
import { Dialog } from '../../../../components/ui/dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { NoAccess } from '../../../../components/ui/no-access';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/format';
import { homeFor } from '../../../../lib/nav';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import { AddLeadDialog } from '../../leads/_components/add-lead-dialog';
import { LeadsTable } from '../../leads/_components/lead-table';
import {
  ErrorPanel,
  FormError,
  messageOf,
  type LeadRow,
  type StaffOption,
} from '../../leads/_components/shared';
import { FunnelBar } from '../_components/funnel-bar';
import {
  CampaignStatusBadge,
  NEXT_MOVES,
  TYPE_LABELS,
  dateRange,
  type CampaignDetail,
} from '../_components/shared';

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStaff();
  const allowed = can(user.role, 'campaign:manage');
  const canLeads = can(user.role, 'lead:read');
  const canAddLead = can(user.role, 'lead:write');
  const detail = useApi<CampaignDetail>(allowed ? `/campaigns/${encodeURIComponent(id)}` : null);
  const leads = useApi<LeadRow[]>(
    allowed && canLeads ? `/leads?campaignId=${encodeURIComponent(id)}` : null,
  );
  const directory = useApi<StaffOption[]>(allowed && canAddLead ? '/users/directory' : null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [moving, setMoving] = useState<string>();
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);
  const c = detail.data;

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const move = async (to: string) => {
    setMoving(to);
    setError(undefined);
    try {
      await apiClient.post(`/campaigns/${id}/status`, { status: to });
      setConfirmCancel(false);
      detail.reload();
    } catch (e) {
      setError(messageOf(e, 'The status was not changed. Please try again.'));
    } finally {
      setMoving(undefined);
    }
  };

  const owners = (directory.data ?? []).filter(
    (u) => u.role === 'MARKETING' || u.role === 'ADMINISTRATOR',
  );
  const moves = c ? NEXT_MOVES[c.status] : [];
  const forward = moves.find((m) => m.to !== 'CANCELLED');
  const cancel = moves.find((m) => m.to === 'CANCELLED');

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Campaigns
      </Link>

      {detail.loading && (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!detail.loading && detail.errorStatus === 404 && (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Campaign not found"
            description="This campaign does not exist, or it belongs to another clinic."
            action={
              <Link href="/campaigns" className="text-sm font-medium text-primary">
                Back to campaigns
              </Link>
            }
          />
        </Card>
      )}

      {!detail.loading && detail.errorStatus !== undefined && detail.errorStatus !== 404 && (
        <Card>
          <ErrorPanel message={detail.errorMessage} onRetry={detail.reload} />
        </Card>
      )}

      {c && (
        <>
          <InkSheet>
            <SheetHead
              eyebrow={`${TYPE_LABELS[c.type] ?? c.type} · ${dateRange(c)}`}
              title={c.name}
              description={[c.location, c.channel].filter(Boolean).join(' · ') || undefined}
              figures={
                <Figures
                  items={[
                    { label: 'Leads', value: c.totalLeads },
                    { label: 'Booked', value: c.funnel.APPOINTMENT_BOOKED },
                    { label: 'Converted', value: c.funnel.CONVERTED },
                    {
                      label: 'Conversion',
                      value:
                        c.totalLeads > 0
                          ? Math.round((c.funnel.CONVERTED / c.totalLeads) * 100)
                          : undefined,
                      unit: '%',
                    },
                  ]}
                />
              }
              action={<CampaignStatusBadge status={c.status} />}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-8 px-5 pb-8 pt-6 sm:px-8">
                <InkSection
                  number={1}
                  title="Funnel"
                  meta={`${c.totalLeads} ${c.totalLeads === 1 ? 'lead' : 'leads'}, counted by where they are now`}
                >
                  {c.totalLeads === 0 ? (
                    <p className="py-3 text-[13px] text-fg-muted">
                      No leads are tagged with this campaign yet. Add a lead and choose this
                      campaign as the source.
                    </p>
                  ) : (
                    <FunnelBar funnel={c.funnel} total={c.totalLeads} />
                  )}
                </InkSection>

                {canLeads && (
                  <InkSection
                    number={2}
                    title="Leads from this campaign"
                    meta={leads.data ? `${leads.data.length}` : undefined}
                    action={
                      canAddLead ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Plus size={16} aria-hidden="true" />}
                          onClick={() => setAdding(true)}
                        >
                          Add lead
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="-mx-5 sm:-mx-8">
                      {leads.errorStatus !== undefined && !leads.loading ? (
                        <ErrorPanel message={leads.errorMessage} onRetry={leads.reload} />
                      ) : (
                        <LeadsTable
                          showCampaign={false}
                          rows={leads.data}
                          loading={leads.loading}
                          empty={
                            <EmptyState
                              icon={UsersThree}
                              title="No leads yet"
                              description="Leads added with this campaign as their source appear here."
                            />
                          }
                        />
                      )}
                    </div>
                  </InkSection>
                )}
              </div>

              <SheetRail label="Campaign status and details">
                {(forward || cancel) && (
                  <InkSection title="Status">
                    <div className="mt-3 flex flex-col gap-2">
                      {forward && (
                        <Button
                          className="w-full"
                          loading={moving === forward.to}
                          onClick={() => void move(forward.to)}
                        >
                          {forward.label}
                        </Button>
                      )}
                      {cancel && (
                        <Button
                          className="w-full"
                          variant="ghost"
                          onClick={() => setConfirmCancel(true)}
                        >
                          {cancel.label}
                        </Button>
                      )}
                      <FormError message={error && !confirmCancel ? error : undefined} />
                    </div>
                  </InkSection>
                )}
                <InkSection title="Details">
                  <dl className="divide-y divide-line">
                    <LedgerLine
                      label="Type"
                      value={<span className="font-sans">{TYPE_LABELS[c.type] ?? c.type}</span>}
                    />
                    {c.location && (
                      <LedgerLine
                        label="Location"
                        value={<span className="font-sans">{c.location}</span>}
                      />
                    )}
                    {c.channel && (
                      <LedgerLine
                        label="Channel"
                        value={<span className="font-sans">{c.channel}</span>}
                      />
                    )}
                    <LedgerLine label="Dates" value={dateRange(c)} />
                    <LedgerLine
                      label="Budget"
                      value={c.budgetMinor !== null ? formatMoney(c.budgetMinor) : 'Not set'}
                      tone={c.budgetMinor !== null ? undefined : 'muted'}
                    />
                    {c.budgetMinor !== null && c.funnel.CONVERTED > 0 && (
                      <LedgerLine
                        label="Per patient"
                        value={formatMoney(Math.round(c.budgetMinor / c.funnel.CONVERTED))}
                        tone="muted"
                      />
                    )}
                    <LedgerLine
                      label="Created by"
                      value={
                        <span className="font-sans">{c.createdBy?.fullName ?? 'Unknown'}</span>
                      }
                    />
                  </dl>
                </InkSection>
                {c.notes && (
                  <InkSection title="Notes">
                    <MarginNote className="mt-2 whitespace-pre-wrap text-[13px] text-fg">
                      {c.notes}
                    </MarginNote>
                  </InkSection>
                )}
              </SheetRail>
            </div>
          </InkSheet>

          <Dialog
            open={confirmCancel}
            onClose={() => setConfirmCancel(false)}
            title={`Cancel ${c.name}`}
            description="A cancelled campaign cannot be restarted. Its leads are kept."
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                  Keep campaign
                </Button>
                <Button
                  variant="danger"
                  loading={moving === 'CANCELLED'}
                  onClick={() => void move('CANCELLED')}
                >
                  Cancel campaign
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">
                Cancel {c.name}? Leads already tagged with it stay on their own pages.
              </p>
              <FormError message={error} />
            </div>
          </Dialog>

          <AddLeadDialog
            open={adding}
            onClose={() => setAdding(false)}
            campaigns={[{ id: c.id, name: c.name, type: c.type, status: c.status }]}
            owners={owners}
            presetCampaignId={c.id}
            onSaved={() => {
              leads.reload();
              detail.reload();
            }}
          />
        </>
      )}
    </div>
  );
}
