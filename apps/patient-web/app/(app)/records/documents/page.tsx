'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowSquareOut,
  File as FileIcon,
  FileText,
  Folder,
  IdentificationCard,
  Image as ImageIcon,
  ShieldCheck,
  type Icon,
} from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import {
  Button,
  Card,
  CardsSkeleton,
  EmptyState,
  ErrorNote,
  IconBadge,
  PageTitle,
} from '../../../../components/ui';
import { fetchFile } from '../../../../lib/api-client';
import { formatDate } from '../../../../lib/format';
import type { PatientDocument } from '../../../../lib/types';
import { useApi } from '../../../../lib/use-api';

const TYPE: Record<PatientDocument['documentType'], { label: string; icon: Icon }> = {
  PHOTO: { label: 'Photo', icon: ImageIcon },
  ID_PROOF: { label: 'ID proof', icon: IdentificationCard },
  INSURANCE_CARD: { label: 'Insurance card', icon: ShieldCheck },
  PAN_CARD: { label: 'PAN card', icon: IdentificationCard },
  CONSENT_FORM: { label: 'Consent form', icon: FileText },
  OTHER: { label: 'Other', icon: FileIcon },
};

/**
 * Files the clinic keeps on the patient's record (ID, insurance card,
 * consent forms). Each opens in a new tab: the file streams behind the
 * sign-in token, so it is fetched first and then shown.
 */
export default function DocumentsPage() {
  const documents = useApi<PatientDocument[]>('/patients/me/documents');
  const sorted = [...(documents.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div>
      <Link
        href="/records"
        className="-ml-2 mb-6 inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-primary"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        Records
      </Link>

      <PageTitle title="Documents" description="Files the clinic keeps on your record." />

      {documents.loading ? (
        <CardsSkeleton count={2} />
      ) : documents.error ? (
        <ErrorNote message={documents.error} onRetry={documents.reload} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No documents yet"
          description="The clinic hasn't added any documents yet. Your ID, insurance card and consent forms will show up here once they are on file."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((d) => (
            <li key={d.id}>
              <DocumentRow document={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({ document }: { document: PatientDocument }) {
  const type = TYPE[document.documentType] ?? TYPE.OTHER;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();

  async function open() {
    setOpening(true);
    setError(undefined);
    try {
      const blob = await fetchFile(`/patients/me/documents/${document.id}/file`);
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, '_blank', 'noopener,noreferrer');
      if (!tab)
        setError('Your browser blocked the file from opening. Allow pop-ups and try again.');
      // Give the new tab time to load before the URL is released.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? 'We could not open this file just now.'
          : 'You seem to be offline. Check your connection.',
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card as="article">
      <div className="flex items-start gap-4">
        <IconBadge icon={type.icon} tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{type.label}</p>
          <p className="break-words text-fg-muted">{document.fileName}</p>
          <p className="text-sm text-fg-subtle">Added {formatDate(document.createdAt)}</p>
        </div>
      </div>
      <div className="mt-4">
        <Button
          variant="secondary"
          full
          loading={opening}
          onClick={open}
          icon={<ArrowSquareOut size={20} aria-hidden="true" />}
        >
          {opening ? 'Opening' : 'Open'}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      )}
    </Card>
  );
}
