'use client';

import { useState } from 'react';
import { Notebook, Plus } from '@phosphor-icons/react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { DataTable, type Column } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { NoAccess } from '../../../components/ui/no-access';
import { PageHeader } from '../../../components/ui/page-header';
import { formatDate, humanize } from '../../../lib/format';
import { homeFor } from '../../../lib/nav';
import { can } from '../../../lib/permissions';
import { useStaff } from '../../../lib/staff-context';
import { useApi } from '../../../lib/use-api';
import {
  NewTemplateDialog,
  NewVersionDialog,
  ToggleActiveDialog,
  type TemplateRow,
} from './_components/template-dialogs';

/**
 * Clinical note templates: what a doctor can start a note from. Each
 * edit is a new version; notes keep the version they were written with.
 */
export default function TemplatesPage() {
  const user = useStaff();
  const allowed = can(user.role, 'clinical-template:manage');
  const [creating, setCreating] = useState(false);
  const [versioning, setVersioning] = useState<TemplateRow>();
  const [toggling, setToggling] = useState<TemplateRow>();

  const templates = useApi<TemplateRow[]>(allowed ? '/clinical-templates' : null);

  if (!allowed) {
    return (
      <Card>
        <NoAccess homeHref={homeFor(user.role)} />
      </Card>
    );
  }

  const columns: Column<TemplateRow>[] = [
    {
      header: 'Template',
      render: (t) => (
        <div>
          <p className="font-medium text-fg">{t.name}</p>
          <p className="tabular text-xs text-fg-muted">Updated {formatDate(t.updatedAt)}</p>
        </div>
      ),
    },
    { header: 'Note type', render: (t) => humanize(t.noteType) },
    {
      header: 'Specialty',
      render: (t) => t.specialty ?? <span className="text-fg-subtle">All</span>,
    },
    { header: 'Version', align: 'right', render: (t) => t.currentVersion },
    {
      header: 'Status',
      render: (t) =>
        t.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
    },
    {
      header: 'Actions',
      render: (t) => (
        <div className="flex flex-wrap gap-1.5 py-1">
          <Button size="sm" variant="secondary" onClick={() => setVersioning(t)}>
            New version
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setToggling(t)}>
            {t.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Templates"
        description="Starting points for clinical notes: a prompt and default text per section."
        action={
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            New template
          </Button>
        }
      />

      <Card>
        {templates.errorStatus !== undefined && !templates.loading ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-fg-muted">
              {templates.errorStatus === 403
                ? 'You do not have access to templates.'
                : (templates.errorMessage ?? 'This could not be loaded.')}
            </p>
            <Button variant="secondary" onClick={templates.reload}>
              Try again
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={templates.data}
            getRowKey={(t) => t.id}
            loading={templates.loading}
            empty={
              <EmptyState
                icon={Notebook}
                title="No templates yet"
                description="A template gives doctors a prompt and default text for each section of a note."
                action={
                  <Button
                    variant="secondary"
                    icon={<Plus size={18} aria-hidden="true" />}
                    onClick={() => setCreating(true)}
                  >
                    New template
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <NewTemplateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={templates.reload}
      />
      <NewVersionDialog
        template={versioning}
        onClose={() => setVersioning(undefined)}
        onSaved={templates.reload}
      />
      <ToggleActiveDialog
        template={toggling}
        onClose={() => setToggling(undefined)}
        onSaved={templates.reload}
      />
    </>
  );
}
