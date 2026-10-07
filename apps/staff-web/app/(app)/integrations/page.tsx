'use client';

import { useState } from 'react';
import { Lock } from '@phosphor-icons/react';
import {
  INTEGRATION_CATALOG,
  INTEGRATION_PROVIDERS,
  type IntegrationView,
} from '@serenemed/validation';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import {
  Figures,
  InkSection,
  InkSheet,
  MarginNote,
  SheetHead,
  SheetRail,
} from '../../../components/ui/ink';
import { NoAccess } from '../../../components/ui/no-access';
import { Skeleton } from '../../../components/ui/skeleton';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import { ConfigDrawer } from './_components/config-drawer';
import { connectionStatus, whenText } from './_components/shared';

type Provider = (typeof INTEGRATION_PROVIDERS)[number];

const GROUP_ORDER = [
  'Payments',
  'AI',
  'Messaging',
  'Accounting',
  'Storage',
  'Clinical partners',
  'Video',
] as const;

export default function IntegrationsPage() {
  const user = useStaff();
  const allowed = can(user.role, 'integration:manage');
  const list = useApi<IntegrationView[]>(allowed ? '/integrations' : null);
  const [selected, setSelected] = useState<Provider>();

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const viewOf = (provider: Provider) => list.data?.find((v) => v.provider === provider);

  const statuses = INTEGRATION_PROVIDERS.map((p) => connectionStatus(viewOf(p)).label);
  const tally = (label: string) =>
    list.data ? statuses.filter((l) => l === label).length : undefined;
  const groups = GROUP_ORDER.map((group) => ({
    group,
    providers: INTEGRATION_PROVIDERS.filter((p) => INTEGRATION_CATALOG[p].group === group),
  })).filter((g) => g.providers.length > 0);

  return (
    <>
      <InkSheet>
        <SheetHead
          title="Integrations"
          description="Connect the outside services the clinic uses, such as payments, messaging and labs."
          figures={
            <Figures
              loading={list.loading && !list.data}
              items={[
                { label: 'Connected', value: tally('Connected') },
                { label: 'Saved, switched off', value: tally('Saved, switched off') },
                { label: 'Not connected', value: tally('Not connected') },
              ]}
            />
          }
        />

        {list.errorStatus !== undefined && !list.data ? (
          <div role="alert" className="flex items-center justify-between gap-4 px-8 py-6">
            <p className="text-sm text-danger-fg">{list.errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={list.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-8 px-5 pb-8 pt-6 sm:px-8">
              {groups.map(({ group, providers }, index) => {
                return (
                  <InkSection
                    key={group}
                    id={`group-${group.replace(/\s+/g, '-').toLowerCase()}`}
                    number={index + 1}
                    title={group}
                    meta={`${providers.length} ${providers.length === 1 ? 'service' : 'services'}`}
                  >
                    <ul className="divide-y divide-line">
                      {providers.map((provider) => {
                        const definition = INTEGRATION_CATALOG[provider];
                        const view = viewOf(provider);
                        const status = connectionStatus(view);
                        return (
                          <li
                            key={provider}
                            className="grid grid-cols-1 items-center gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_170px_auto]"
                          >
                            <div className="min-w-0">
                              <h3 className="text-sm font-medium text-fg">{definition.label}</h3>
                              <p className="mt-0.5 max-w-[72ch] text-[13px] text-fg-muted">
                                {definition.description}
                              </p>
                              {view?.updatedAt && (
                                <p className="mt-0.5 text-[12px] text-fg-subtle">
                                  Last changed{' '}
                                  <span className="tabular font-mono">
                                    {whenText(view.updatedAt)}
                                  </span>
                                  {view.updatedBy ? ` by ${view.updatedBy}` : ''}
                                </p>
                              )}
                            </div>
                            <div>
                              {list.loading ? (
                                <Skeleton className="h-5 w-24" />
                              ) : (
                                <Badge tone={status.tone}>{status.label}</Badge>
                              )}
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={list.loading}
                              onClick={() => setSelected(provider)}
                              aria-label={`Configure ${definition.label}`}
                            >
                              Configure
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </InkSection>
                );
              })}
            </div>

            <SheetRail label="How keys are kept">
              <InkSection title="Keys">
                <div className="mt-2 flex gap-2.5">
                  <Lock size={18} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
                  <MarginNote className="text-[13px]">
                    Keys are stored encrypted and shown only as their last four characters. Only
                    administrators can change them, and every change is recorded without the key
                    itself.
                  </MarginNote>
                </div>
              </InkSection>
              <InkSection title="Testing">
                <MarginNote className="mt-2 text-[13px]">
                  Connections are not tested yet: a provider adapter has to be built before any of
                  these services is used.
                </MarginNote>
              </InkSection>
            </SheetRail>
          </div>
        )}
      </InkSheet>

      {selected && (
        <ConfigDrawer
          key={selected}
          provider={selected}
          view={viewOf(selected)}
          onClose={() => setSelected(undefined)}
          onChanged={list.reload}
        />
      )}
    </>
  );
}
