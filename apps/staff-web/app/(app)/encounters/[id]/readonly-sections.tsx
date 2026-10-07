import { Badge } from '../../../../components/ui/badge';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import { orderTone, type Procedure, type Referral } from './types';

function SubHeading({ children }: { children: string }) {
  return (
    <h4 className="flex min-h-8 items-center border-b border-line text-[13px] font-semibold text-fg">
      {children}
    </h4>
  );
}

/** Referrals on this visit (read only here; managed on the Referrals page). */
export function ReferralsList({ referrals }: { referrals: Referral[] }) {
  return (
    <div className="mt-4">
      <SubHeading>Referrals</SubHeading>
      {referrals.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">No referrals for this visit.</p>
      ) : (
        <ul className="divide-y divide-line">
          {referrals.map((r) => {
            const to = [r.toName, r.toSpecialty, r.toFacility].filter(Boolean).join(', ');
            return (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{to || humanize(r.type)}</span>
                  <span className="text-xs text-fg-muted">{humanize(r.type)}</span>
                  <span className="ml-auto flex gap-1.5">
                    {r.urgency !== 'ROUTINE' && <Badge tone="warning">{humanize(r.urgency)}</Badge>}
                    <Badge tone={orderTone(r.status)}>{humanize(r.status)}</Badge>
                  </span>
                </div>
                <p className="text-[13px] text-fg-muted">{r.reason}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Procedures on this visit (read only here; managed on the Procedures page). */
export function ProceduresList({ procedures }: { procedures: Procedure[] }) {
  return (
    <div className="mt-4">
      <SubHeading>Procedures</SubHeading>
      {procedures.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">No procedures for this visit.</p>
      ) : (
        <ul className="divide-y divide-line">
          {procedures.map((p) => (
            <li key={p.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{p.name}</span>
                <span className="text-xs text-fg-muted">{humanize(p.kind)}</span>
                <span className="ml-auto">
                  <Badge tone={orderTone(p.status)}>{humanize(p.status)}</Badge>
                </span>
              </div>
              {(p.scheduledAt || p.location) && (
                <p className="text-[13px] text-fg-muted">
                  {p.scheduledAt && (
                    <span className="font-mono">
                      {formatDate(p.scheduledAt)} {formatTime(p.scheduledAt)}
                    </span>
                  )}
                  {p.scheduledAt && p.location ? ' · ' : ''}
                  {p.location}
                </p>
              )}
              {p.notes && <p className="text-[13px] text-fg-muted">{p.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
