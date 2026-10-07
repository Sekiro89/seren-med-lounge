'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Megaphone, Plus, UsersThree } from '@phosphor-icons/react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
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

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

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
    <div className="flex flex-col gap-8">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All campaigns
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
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold leading-8 tracking-tight text-fg">
                  {c.name}
                </h1>
                <CampaignStatusBadge status={c.status} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
                <Badge tone="neutral">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                <span className="tabular font-mono">{dateRange(c)}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {cancel && (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                  {cancel.label}
                </Button>
              )}
              {forward && (
                <Button loading={moving === forward.to} onClick={() => void move(forward.to)}>
                  {forward.label}
                </Button>
              )}
            </div>
          </div>
          <FormError message={error && !confirmCancel ? error : undefined} />

          <Card>
            <CardHeader
              title="Funnel"
              description={`${c.totalLeads} ${c.totalLeads === 1 ? 'lead' : 'leads'} so far, counted by where they are now.`}
            />
            <div className="px-6 py-6">
              {c.totalLeads === 0 ? (
                <p className="text-sm text-fg-muted">
                  No leads are tagged with this campaign yet. Add a lead and choose this campaign as
                  the source.
                </p>
              ) : (
                <FunnelBar funnel={c.funnel} total={c.totalLeads} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-1 gap-6 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Type">{TYPE_LABELS[c.type] ?? c.type}</Detail>
              {c.location && (
                <Detail label="Location">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} aria-hidden="true" />
                    {c.location}
                  </span>
                </Detail>
              )}
              {c.channel && <Detail label="Channel">{c.channel}</Detail>}
              <Detail label="Budget">
                {c.budgetMinor !== null ? (
                  <span className="tabular font-mono">{formatMoney(c.budgetMinor)}</span>
                ) : (
                  <span className="text-fg-subtle">Not set</span>
                )}
              </Detail>
              <Detail label="Created by">
                {c.createdBy?.fullName ?? <span className="text-fg-subtle">Unknown</span>}
              </Detail>
              {c.notes && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <Detail label="Notes">
                    <span className="whitespace-pre-wrap">{c.notes}</span>
                  </Detail>
                </div>
              )}
            </dl>
          </Card>

          {canLeads && (
            <Card>
              <CardHeader
                title="Leads from this campaign"
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
              />
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
            </Card>
          )}

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
