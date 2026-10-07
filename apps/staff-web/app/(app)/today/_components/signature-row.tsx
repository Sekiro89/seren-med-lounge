'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowSquareIn, CheckCircle, Flask, NotePencil } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatTime, fullName, humanize } from '../../../../lib/format';
import type { Inbox, InboxPatient } from './model';

const short = (p: InboxPatient) => `${p.firstName} ${p.lastName.charAt(0)}.`;

/**
 * The bottom strip of the doctor's Today: what cannot move without them.
 * One cell per kind (drafts, abnormal results, referrals), newest first,
 * each with the one action that resolves it.
 */
export function SignatureRow({
  inbox,
  loading,
  failed,
  signs,
  me,
}: {
  inbox: Inbox | undefined;
  loading: boolean;
  failed: boolean;
  /** Senior doctors sign others' drafts; juniors see their own drafts waiting for sign-off. */
  signs: boolean;
  /** The signed-in doctor, so their own drafts are counted apart from others'. */
  me?: string;
}) {
  const total = inbox
    ? inbox.counts.drafts + inbox.counts.abnormalResults + inbox.counts.referrals
    : undefined;

  const cells: ReactNode[] = [];
  if (inbox && inbox.drafts.length > 0) {
    // A senior signs others' work first; their own drafts are counted on the side.
    const others = signs && me ? inbox.drafts.filter((d) => d.author.fullName !== me) : [];
    const own = inbox.drafts.length - others.length;
    const list = others.length > 0 ? others : inbox.drafts;
    const first = list[0]!;
    const authors = [...new Set(list.map((d) => d.author.fullName))];
    const patients = [...new Set(list.map((d) => short(d.patient)))];
    const n = others.length > 0 ? others.length : inbox.counts.drafts;
    const allNotes = list.every((d) => d.kind === 'note');
    cells.push(
      <Cell
        key="drafts"
        icon={NotePencil}
        title={
          n === 1
            ? `${first.kind === 'note' ? `${humanize(first.label)} note` : `Diagnosis: ${first.label}`}`
            : `${n} draft${allNotes ? ' notes' : 's'}${signs && authors.length === 1 ? ` from ${authors[0]}` : ''}`
        }
        sub={`${patients.slice(0, 3).join(', ')}${patients.length > 3 ? ' …' : ''}${
          signs
            ? others.length > 0
              ? own > 0
                ? ` · and ${own} of yours`
                : ''
              : ` · ${authors.length === 1 ? authors[0] : `${authors.length} authors`}`
            : ' · waiting for sign-off'
        }`}
        href={`/encounters/${first.encounterId}`}
        action={signs ? 'Review' : 'Open'}
      />,
    );
  }
  if (inbox && inbox.abnormalResults.length > 0) {
    const r = inbox.abnormalResults[0]!;
    const more = inbox.counts.abnormalResults - 1;
    cells.push(
      <Cell
        key="results"
        icon={Flask}
        title={
          <>
            {r.testName} <span className="tabular font-mono">{r.resultValue}</span>
            {r.unit ? ` ${r.unit}` : ''}
            <span
              className={`ml-1.5 text-[12px] font-semibold ${r.direction === 'high' ? 'text-warning-fg' : 'text-danger-fg'}`}
            >
              {r.direction === 'high' ? 'High' : 'Low'}
            </span>
          </>
        }
        sub={
          <>
            {fullName(r.patient)} · reported{' '}
            <span className="tabular font-mono">{formatTime(r.createdAt)}</span>
            {more > 0 && ` · ${more} more`}
          </>
        }
        href={`/encounters/${r.encounterId}`}
        action="Open"
      />,
    );
  }
  if (inbox && inbox.referrals.length > 0) {
    const r = inbox.referrals[0]!;
    const more = inbox.counts.referrals - 1;
    cells.push(
      <Cell
        key="referrals"
        icon={ArrowSquareIn}
        title={
          <>
            Referral: {r.reason}
            {r.urgency !== 'ROUTINE' && (
              <span className="ml-1.5 text-[12px] font-semibold text-danger-fg">
                {humanize(r.urgency)}
              </span>
            )}
          </>
        }
        sub={`${short(r.patient)} · from ${r.from.fullName}${more > 0 ? ` · ${more} more` : ''}`}
        href="/referrals"
        action="Open"
      />,
    );
  }

  return (
    <section
      className="grid grid-cols-1 border-t border-line md:grid-cols-[220px_repeat(3,minmax(0,1fr))]"
      aria-label={signs ? 'Needs your signature' : 'Your open drafts'}
    >
      <div className="px-8 py-4">
        <h2 className="text-[14px] font-semibold text-fg">
          {signs ? 'Needs your signature' : 'Waiting on you'}
        </h2>
        <div className="mt-0.5 text-[12px] text-fg-muted">
          {loading && !inbox ? (
            <Skeleton className="h-4 w-32" />
          ) : failed ? (
            'This could not be loaded.'
          ) : (
            <>
              <span className="tabular font-mono text-fg">{total ?? 0}</span>{' '}
              {total === 1 ? 'item' : 'items'}
              {signs ? ' · nothing leaves draft without you' : ''}
            </>
          )}
        </div>
      </div>
      {cells}
      {inbox && cells.length === 0 && (
        <div className="flex items-center gap-3 px-6 py-4 text-[13px] text-fg-muted md:col-span-3 md:border-l md:border-line">
          <CheckCircle size={20} className="text-success-fg" aria-hidden="true" />
          Nothing is waiting on you.
        </div>
      )}
    </section>
  );
}

function Cell({
  icon: IconComponent,
  title,
  sub,
  href,
  action,
}: {
  icon: Icon;
  title: ReactNode;
  sub: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line px-6 py-4 md:border-l md:border-t-0">
      <IconComponent size={20} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{title}</p>
        <p className="truncate text-[12px] text-fg-muted">{sub}</p>
      </div>
      <Link
        href={href}
        className="inline-flex h-8 shrink-0 items-center rounded-control border border-control px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-muted"
      >
        {action}
      </Link>
    </div>
  );
}
