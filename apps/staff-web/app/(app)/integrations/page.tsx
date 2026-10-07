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
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
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

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect the outside services the clinic uses, such as payments, messaging and labs."
      />

      <div className="mb-8 flex items-start gap-3 rounded-panel bg-surface-muted px-6 py-5">
        <Lock size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
        <p className="max-w-3xl text-sm text-fg-muted">
          Keys are stored encrypted and shown only as their last four characters. Only
          administrators can change them, and every change is recorded without the key itself.
          Connections are not tested yet: a provider adapter has to be built before any of these
          services is used.
        </p>
      </div>

      {list.errorStatus !== undefined && !list.data ? (
        <Card>
          <div role="alert" className="flex items-center justify-between gap-4 px-6 py-6">
            <p className="text-sm text-danger-fg">{list.errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={list.reload}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {GROUP_ORDER.map((group) => {
            const providers = INTEGRATION_PROVIDERS.filter(
              (p) => INTEGRATION_CATALOG[p].group === group,
            );
            if (providers.length === 0) return null;
            return (
              <section key={group} aria-labelledby={`group-${group}`}>
                <h2 id={`group-${group}`} className="mb-3 text-base font-semibold text-fg">
                  {group}
                </h2>
                <Card className="divide-y divide-line">
                  {providers.map((provider) => {
                    const definition = INTEGRATION_CATALOG[provider];
                    const view = viewOf(provider);
                    const status = connectionStatus(view);
                    return (
                      <div
                        key={provider}
                        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                      >
                        <div className="min-w-0 max-w-xl">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-[15px] font-medium text-fg">{definition.label}</h3>
                            {list.loading ? (
                              <Skeleton className="h-5 w-24 rounded-full" />
                            ) : (
                              <Badge tone={status.tone}>{status.label}</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-[13px] text-fg-muted">{definition.description}</p>
                          {view?.updatedAt && (
                            <p className="mt-1 text-[13px] text-fg-subtle">
                              Last changed {whenText(view.updatedAt)}
                              {view.updatedBy ? ` by ${view.updatedBy}` : ''}
                            </p>
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
                      </div>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>
      )}

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
