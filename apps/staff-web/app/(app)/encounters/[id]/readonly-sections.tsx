import { Badge, StatusBadge } from '../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../components/ui/card';
import { formatDate, formatTime, humanize } from '../../../../lib/format';
import {
  isUnsigned,
  orderTone,
  type ClinicalNote,
  type MetabolicWorkup,
  type Procedure,
  type Referral,
} from './types';

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-fg-muted">{children}</p>;
}

export function MetabolicSection({ workups }: { workups: MetabolicWorkup[] }) {
  return (
    <Card>
      <CardHeader title="Metabolic workup" />
      <div className="p-5">
        {workups.length === 0 ? (
          <Empty>No metabolic workup recorded for this visit.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {workups.map((w) => {
              const parts = [
                w.glucoseMgDl != null &&
                  `Glucose ${w.glucoseMgDl} mg/dL${w.glucoseContext ? ` (${humanize(w.glucoseContext).toLowerCase()})` : ''}`,
                w.hba1cPercent != null && `HbA1c ${w.hba1cPercent}%`,
                w.totalCholesterolMgDl != null && `Total cholesterol ${w.totalCholesterolMgDl}`,
                w.ldlMgDl != null && `LDL ${w.ldlMgDl}`,
                w.hdlMgDl != null && `HDL ${w.hdlMgDl}`,
                w.triglyceridesMgDl != null && `Triglycerides ${w.triglyceridesMgDl}`,
                w.bodyFatPercent != null && `Body fat ${w.bodyFatPercent}%`,
                w.muscleMassKg != null && `Muscle mass ${w.muscleMassKg} kg`,
                w.visceralFatLevel != null && `Visceral fat ${w.visceralFatLevel}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li
                  key={w.id}
                  className="rounded-control bg-surface-muted px-3 py-2 text-sm text-fg"
                >
                  <span className="tabular mr-2 text-xs text-fg-subtle">
                    {formatDate(w.createdAt)} {formatTime(w.createdAt)}
                  </span>
                  <span className="tabular">{parts}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function NotesSection({ notes }: { notes: ClinicalNote[] }) {
  return (
    <Card>
      <CardHeader title="Clinical notes" />
      <div className="p-5">
        {notes.length === 0 ? (
          <Empty>No clinical notes for this visit.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => {
              const latest = note.versions[0];
              return (
                <li key={note.id} className="rounded-control bg-surface-muted px-3 py-2 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-fg">{humanize(note.noteType)}</span>
                    {isUnsigned(note.status) ? (
                      <Badge tone="warning">Draft, not signed</Badge>
                    ) : (
                      <StatusBadge domain="note" status={note.status} />
                    )}
                  </div>
                  {latest ? (
                    <dl className="grid grid-cols-1 gap-1 text-fg">
                      {(
                        [
                          ['Subjective', latest.subjective],
                          ['Objective', latest.objective],
                          ['Assessment', latest.assessment],
                          ['Plan', latest.plan],
                        ] as const
                      )
                        .filter(([, text]) => text)
                        .map(([label, text]) => (
                          <div key={label}>
                            <dt className="inline text-xs font-semibold uppercase tracking-wide text-fg-muted">
                              {label}{' '}
                            </dt>
                            <dd className="inline">{text}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : (
                    <p className="text-fg-muted">No content yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function ReferralsSection({ referrals }: { referrals: Referral[] }) {
  return (
    <Card>
      <CardHeader title="Referrals" />
      <div className="p-5">
        {referrals.length === 0 ? (
          <Empty>No referrals for this visit.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {referrals.map((r) => {
              const to = [r.toName, r.toSpecialty, r.toFacility].filter(Boolean).join(', ');
              return (
                <li key={r.id} className="rounded-control bg-surface-muted px-3 py-2 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={orderTone(r.status)}>{humanize(r.status)}</Badge>
                    {r.urgency !== 'ROUTINE' && <Badge tone="warning">{humanize(r.urgency)}</Badge>}
                    <span className="text-xs text-fg-muted">{humanize(r.type)}</span>
                  </div>
                  {to && <p className="font-medium text-fg">{to}</p>}
                  <p className="text-fg-muted">{r.reason}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function ProceduresSection({ procedures }: { procedures: Procedure[] }) {
  return (
    <Card>
      <CardHeader title="Procedures" />
      <div className="p-5">
        {procedures.length === 0 ? (
          <Empty>No procedures for this visit.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {procedures.map((p) => (
              <li key={p.id} className="rounded-control bg-surface-muted px-3 py-2 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{p.name}</span>
                  <Badge tone={orderTone(p.status)}>{humanize(p.status)}</Badge>
                  <span className="text-xs text-fg-muted">{humanize(p.kind)}</span>
                </div>
                {(p.scheduledAt || p.location) && (
                  <p className="text-fg-muted">
                    {p.scheduledAt && `${formatDate(p.scheduledAt)} ${formatTime(p.scheduledAt)}`}
                    {p.scheduledAt && p.location ? ' · ' : ''}
                    {p.location}
                  </p>
                )}
                {p.notes && <p className="text-fg-muted">{p.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
