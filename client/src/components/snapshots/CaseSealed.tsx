import { shortId } from '../../lib/shortId';

/** §16: the case chain a run sealed (payloadVersion 4), as produce-run read it from lvrf_case_chain(). */
export interface SealedCase {
  hypotheses: {
    id: string; statement: string; verdict: string; post_hoc: boolean; author: string | null; stated_on: string;
    superseded_by: string | null; supersession_reason: string | null; withdrawn: boolean; withdrawal_reason: string | null;
    falsifier: { reference: string; value: string; recorded_on: string; due: string; conditions: string };
    lever: { id: string; name: string; mechanism: string; leading_indicator: string; citation: string; status: string;
      ratification: { by: string | null; on: string }; withdrawn: boolean;
      offerings: { offering_key: string; name: string; basis: string; withdrawn: boolean }[] } | null;
  }[];
  offerings: { offering_key: string; name: string; primary: boolean; evidence_class: string; verification_source: string }[];
  summaries: { id: string; lens: string; body: string; version: number; author: string | null; drafted_with_ai: boolean; drafting_tool: string | null; written_on: string; value_run_id: string | null }[];
  pack_entry: { id: string; name: string; unit: string; direction: string; definition: string; confounders: string; status: string; version: number; fingerprint: string } | null;
  marker: { kind: string; source_citation: string; note: string; marked_by: string | null; marked_on: string } | null;
  findings: { field: string; value: string; finding_text: string; recorded_on: string }[];
}

const S = 'm-0 mt-0.5 text-[11.5px] text-ink-45';

/** The sealed case, in words: what this run argued, as it stood when the run was produced. Never read live. */
export function CaseSealed({ c, compact = false }: { c: SealedCase | null | undefined; compact?: boolean }) {
  if (!c) {
    return <p className="m-0 text-[12px] text-ink-45" data-testid="case-none">This run was sealed before the case was. It is not filled in afterwards: a run given a case it never sealed would be a falsified record.</p>;
  }
  const current = c.hypotheses.filter((h) => !h.superseded_by && !h.withdrawn);
  return (
    <div className="flex flex-col gap-2" data-testid="case-sealed">
      <p className="m-0 text-[11px] italic text-ink-45" data-testid="sealed-mark">As sealed with the run, never read live.</p>
      <div>
        <p className="m-0 text-[12.5px] font-semibold text-ink">Hypotheses</p>
        {c.hypotheses.length === 0 ? <p className={S}>None stated when this run was produced.</p> : c.hypotheses.map((h) => (
          <div key={h.id} className="mt-1" data-testid="case-hypothesis">
            <p className={'m-0 text-[12.5px] ' + (current.includes(h) ? 'text-ink' : 'text-ink-45 line-through')}>{h.statement}</p>
            <p className={S}>Verdict as sealed: {h.verdict.replace(/_/g, ' ')} · stated by {h.author ?? 'not recorded'}, {h.stated_on}{h.superseded_by ? ` · superseded: ${h.supersession_reason ?? ''}` : ''}{h.withdrawn ? ` · withdrawn: ${h.withdrawal_reason ?? ''}` : ''}</p>
            {!compact && <p className={S}>Falsifier: against the {h.falsifier.reference.replace(/_/g, ' ')} of {h.falsifier.value} (recorded {h.falsifier.recorded_on}), due {h.falsifier.due}{h.falsifier.conditions ? `, provided that: ${h.falsifier.conditions}` : ''}.</p>}
            {h.lever && <p className={S}>Lever: {h.lever.name}, ratified by {h.lever.ratification.by ?? 'not recorded'}, {h.lever.ratification.on}{h.lever.withdrawn ? ' (withdrawn)' : ''}{h.lever.offerings.length ? ` · solutions: ${h.lever.offerings.filter((o) => !o.withdrawn).map((o) => o.name).join(', ') || 'none current'}` : ''}</p>}
          </div>))}
      </div>
      <div>
        <p className="m-0 text-[12.5px] font-semibold text-ink">Pack entry</p>
        {c.pack_entry
          ? <p className={S} data-testid="case-pack-entry">{c.pack_entry.name} ({c.pack_entry.status}, version {c.pack_entry.version}) · fingerprint <span className="font-mono">{c.pack_entry.fingerprint.slice(0, 12)}</span></p>
          : <p className={S}>The metric rests on no pack entry.</p>}
      </div>
      {!compact && <div>
        <p className="m-0 text-[12.5px] font-semibold text-ink">Offerings on the capability</p>
        <p className={S}>{c.offerings.length ? c.offerings.map((o) => `${o.name}${o.primary ? ' (primary)' : ''}`).join(', ') : 'None.'}</p>
      </div>}
      <div>
        <p className="m-0 text-[12.5px] font-semibold text-ink">Executive summaries</p>
        {c.summaries.length === 0 ? <p className={S}>None written when this run was produced.</p> : c.summaries.map((s) => (
          <p key={s.id} className={S} data-testid="case-summary">{s.lens}, version {s.version}, by {s.author ?? 'not recorded'}, {s.written_on}{s.drafted_with_ai ? `, drafted with AI (${s.drafting_tool})` : ''}{compact ? '' : `: ${s.body}`}</p>))}
      </div>
      {(c.marker || c.findings.length > 0) && <div>
        {c.marker && <p className={S} data-testid="case-marker">Marked a reference example ({c.marker.kind.replace(/_/g, ' ')}) by {c.marker.marked_by ?? 'not recorded'}, {c.marker.marked_on}</p>}
        {c.findings.map((f) => <p key={`${f.field}-${f.recorded_on}`} className={'m-0 mt-0.5 text-[11.5px] text-warning'}>{f.finding_text} ({f.recorded_on})</p>)}
      </div>}
      <p className="m-0 text-[10.5px] text-ink-45">Hypothesis ids: {c.hypotheses.map((h) => shortId(h.id)).join(', ') || 'none'}</p>
    </div>
  );
}
