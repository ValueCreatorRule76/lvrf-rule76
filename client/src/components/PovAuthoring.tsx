import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import {
  fetchPov, recorded, NO_NUMBERS, VERDICT_LABEL, VERDICT_TONE,
  type ExecutiveSummary, type Pov, type PovHypothesis, type PovOutcome, type ReferenceMarker,
} from '../api/pov';
import { Badge, Card } from './workbench/Card';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * O2 (LVRF_PLAN §5; O2-D1–D4) — authoring on the account page: hypotheses,
 * the executive summary, and the steward's reference-example marker. The
 * POV page (/accounts/:id/pov) is the read-only document these feed.
 *
 * NOBODY DECIDES A HYPOTHESIS: its verdict is computed from the verified
 * actual (O2-D1), so there is no "decide" here — only state, restate (a new
 * version) and withdraw, while it is open. The falsifier is composed from
 * recorded values: the author chooses baseline or committed target, the due
 * date and words-only conditions; the direction is the pack entry's.
 */

const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL_BUTTON = 'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] ';

function Opener({ label, reason, onOpen }: { label: string; reason?: string; onOpen: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={Boolean(reason)} title={reason} onClick={onOpen}
        className={SMALL_BUTTON + (reason ? 'cursor-not-allowed text-ink-25' : 'text-ink-45 hover:border-ink hover:text-ink') + ' ' + FOCUS_RING}>
        {label}
      </button>
      {reason && <span className="text-[11px] text-ink-45">{reason}</span>}
    </span>
  );
}

/**
 * The falsifier sentence as the POV will render it — the same template as
 * the server's falsifierSentence (server/routes/valueHypotheses.ts), every
 * number quoted from the outcome row. verify_value_hypotheses.sh checks
 * that this preview and the POV's sentence are identical.
 */
function previewFalsifier(o: PovOutcome, reference: string, due: string, conditions: string): string | null {
  if (!o.pack_entry || !due) return null;
  const isTarget = reference === 'committed_target';
  const raw = isTarget ? o.target_value : o.baseline_value;
  const on = isTarget ? o.committed_on : o.baseline_measured_on;
  if (raw === null || on === null) return null;
  const phrase = o.pack_entry.direction === 'decrease' ? 'at or above' : 'at or below';
  const value = `${recorded(raw)}${o.unit ? ` ${o.unit}` : ''}`;
  const ref = isTarget ? `its committed target of ${value} (committed ${on})` : `its baseline of ${value} (recorded ${on})`;
  const c = conditions.trim() ? `, ${conditions.trim()}` : '';
  return `${o.metric_name} ${phrase} ${ref} on ${due}${c}.`;
}

function FalsifierFields({ outcome, v, set }: {
  outcome: PovOutcome | undefined;
  v: { reference: string; due: string; conditions: string };
  set: (patch: Partial<{ reference: string; due: string; conditions: string }>) => void;
}) {
  const hasDigit = /[0-9]/.test(v.conditions);
  const canTarget = Boolean(outcome?.target_value !== null && outcome?.committed_by);
  const preview = outcome ? previewFalsifier(outcome, v.reference, v.due, v.conditions) : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="falsifier-fields">
      <label className="block"><span className={LABEL}>Measured against</span>
        <select className={INPUT} value={v.reference} onChange={(e) => set({ reference: e.target.value })}>
          <option value="baseline">its recorded baseline</option>
          <option value="committed_target" disabled={!canTarget}>its committed target{canTarget ? '' : ' (none committed)'}</option>
        </select>
      </label>
      <label className="block"><span className={LABEL}>Due</span>
        <input type="date" className={INPUT} value={v.due} onChange={(e) => set({ due: e.target.value })} />
      </label>
      <label className="block"><span className={LABEL}>Conditions (words only)</span>
        <input className={INPUT} value={v.conditions} placeholder="on the same denominator, among the covered population"
          onChange={(e) => set({ conditions: e.target.value })} />
        {hasDigit && <span className="mt-1 block text-[11px] text-critical" data-testid="no-numbers">{NO_NUMBERS}</span>}
      </label>
      <div className="sm:col-span-3 border border-rule-soft bg-offwhite px-3 py-2" data-testid="falsifier-preview">
        <span className={LABEL}>What would show it wrong</span>
        <p className="m-0 text-[13px] text-ink">{preview ?? 'Choose an outcome and a due date.'}</p>
        {outcome?.pack_entry && (
          <p className="m-0 mt-1 text-[11px] text-ink-45">
            Direction: {outcome.pack_entry.direction === 'decrease' ? 'lower is better' : 'higher is better'} — from the pack entry
            "{outcome.pack_entry.name}". A hypothesis cannot set it.
          </p>
        )}
      </div>
    </div>
  );
}

function StateHypothesis({ pov, onChanged }: { pov: Pov; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcomeId, setOutcomeId] = useState('');
  const [leverId, setLeverId] = useState('');
  const [statement, setStatement] = useState('');
  const [f, setF] = useState({ reference: 'baseline', due: '', conditions: '' });
  const based = pov.outcomes.filter((o) => o.pack_entry);
  if (!open) {
    const reason = based.length === 0 ? 'A hypothesis needs an outcome whose metric rests on a pack entry.' : undefined;
    return <div className="mt-2"><Opener label="State a hypothesis…" reason={reason} onOpen={() => setOpen(true)} /></div>;
  }
  const outcome = based.find((o) => o.id === outcomeId);
  const levers = pov.levers.filter((l) => outcome && l.industry_measure_id === outcome.industry_measure_id);
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="state-hypothesis">
      <GovernedForm<{ value_hypothesis_id: string }>
        path={`/api/institutions/${pov.institution.id}/hypotheses`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A hypothesis, by you, and what would show it wrong — in recorded values only. <strong>Nobody decides it:</strong> its verdict is computed once a verified actual exists past the due date. It is never edited; restating it makes a new version, and this one stays on the record.</p>}
        fields={<div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className={LABEL}>Outcome (capability and metric)</span>
              <select className={INPUT} value={outcomeId} onChange={(e) => { setOutcomeId(e.target.value); setLeverId(''); }}>
                <option value="">— choose —</option>
                {based.map((o) => <option key={o.id} value={o.id}>{o.metric_name} — {o.capability_name} (baseline {recorded(o.baseline_value)})</option>)}
              </select>
            </label>
            <label className="block"><span className={LABEL}>Lever</span>
              <select className={INPUT} value={leverId} onChange={(e) => setLeverId(e.target.value)} disabled={!outcome}>
                <option value="">{outcome && levers.length === 0 ? '— no current lever on this pack entry —' : '— choose —'}</option>
                {levers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block"><span className={LABEL}>Statement</span>
            <textarea rows={2} className={INPUT} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
          <FalsifierFields outcome={outcome} v={f} set={(p) => setF({ ...f, ...p })} />
        </div>}
        canSubmit={!!outcomeId && !!leverId && statement.trim().length >= 24 && !!f.due && !/[0-9]/.test(f.conditions)}
        buildBody={() => ({ value_outcome_id: outcomeId, value_lever_id: leverId, statement, falsifier_reference: f.reference, falsifier_due: f.due, falsifier_conditions: f.conditions })}
        submitLabel="State the hypothesis"
        onSuccess={() => { setOpen(false); setOutcomeId(''); setLeverId(''); setStatement(''); setF({ reference: 'baseline', due: '', conditions: '' }); onChanged(); }}
        renderSuccess={() => <>Stated.</>} />
    </div>
  );
}

function Restate({ h, outcome, onChanged }: { h: PovHypothesis; outcome: PovOutcome | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState(h.statement);
  const [f, setF] = useState({ reference: h.falsifier_reference as string, due: h.falsifier_due, conditions: h.falsifier_conditions });
  const [why, setWhy] = useState('');
  if (!open) return <Opener label="Restate (new version)…" onOpen={() => setOpen(true)} />;
  return (
    <div className="mt-2 w-full border-t border-rule-soft pt-2" data-testid="restate">
      <GovernedForm<{ value_hypothesis_id: string }>
        path={`/api/value-hypotheses/${h.id}/supersede`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A new version of this hypothesis, with your reason. <strong>The old version stays on the record</strong>, marked superseded: moving the goalposts happens in plain view.</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={LABEL}>Statement</span>
            <textarea rows={2} className={INPUT} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
          <FalsifierFields outcome={outcome} v={f} set={(p) => setF({ ...f, ...p })} />
          <label className="block"><span className={LABEL}>Why it is restated (required)</span>
            <textarea rows={2} className={INPUT} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
        </div>}
        canSubmit={statement.trim().length >= 24 && !!f.due && !/[0-9]/.test(f.conditions) && why.trim().length >= 12}
        buildBody={() => ({ statement, falsifier_reference: f.reference, falsifier_due: f.due, falsifier_conditions: f.conditions, supersession_reason: why })}
        submitLabel="Restate it" onSuccess={() => { setOpen(false); onChanged(); }} renderSuccess={() => <>Restated.</>} />
    </div>
  );
}

function Withdraw({ h, onChanged }: { h: PovHypothesis; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  if (!open) return <Opener label="Withdraw…" onOpen={() => setOpen(true)} />;
  return (
    <div className="mt-2 w-full border-t border-rule-soft pt-2" data-testid="withdraw-hypothesis">
      <GovernedForm<Record<string, unknown>>
        path={`/api/value-hypotheses/${h.id}/withdraw`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That this hypothesis is withdrawn before it was tested, by you, with your reason. It stays on the record, marked.</p>}
        fields={<label className="block"><span className={LABEL}>Why it is withdrawn (required)</span>
          <textarea rows={2} className={INPUT} value={why} onChange={(e) => setWhy(e.target.value)} /></label>}
        canSubmit={why.trim().length >= 12}
        buildBody={() => ({ retirement_reason: why })}
        submitLabel="Withdraw" onSuccess={() => { setOpen(false); onChanged(); }} renderSuccess={() => <>Withdrawn.</>} />
    </div>
  );
}

export function HypothesisItem({ h, outcome, onChanged }: { h: PovHypothesis; outcome?: PovOutcome; onChanged?: () => void }) {
  const current = h.verdict !== 'withdrawn' && h.verdict !== 'superseded';
  return (
    <li className="border-b border-rule-soft py-2.5 last:border-b-0" data-testid="hypothesis" data-verdict={h.verdict}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={'text-[13.5px] ' + (current ? 'text-ink' : 'text-ink-45 line-through')}>{h.statement}</span>
        <Badge tone={VERDICT_TONE[h.verdict]}>{h.verdict.replace(/_/g, ' ')}</Badge>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-ink"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold-ink">What would show it wrong </span>
        <span data-testid="falsifier-text">{h.falsifier_text}</span></p>
      <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">
        {VERDICT_LABEL[h.verdict]} · via the lever "{h.lever.name}" · {h.direction_label} (pack entry "{h.pack_entry.name}")
      </p>
      {h.post_hoc && <p className="m-0 mt-0.5 text-[11.5px] text-gold-ink" data-testid="post-hoc">Written after the result: a description, not a test. It never counts as survived.</p>}
      {h.verdict === 'superseded' && h.supersession_reason && <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">Restated: {h.supersession_reason}</p>}
      {h.verdict === 'withdrawn' && <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">Withdrawn by {h.withdrawn_by}, {h.withdrawn_at?.slice(0, 10)} — {h.withdrawal_reason}</p>}
      <p className="m-0 mt-0.5 text-[11px] text-ink-45">Stated by {h.author}, {h.created_at.slice(0, 10)}</p>
      {onChanged && h.verdict === 'open' && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Restate h={h} outcome={outcome} onChanged={onChanged} />
          <Withdraw h={h} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}

function SummaryForm({ pov, onChanged }: { pov: Pov; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [lens, setLens] = useState<ExecutiveSummary['lens']>('general');
  const [body, setBody] = useState('');
  const [ai, setAi] = useState(false);
  const [tool, setTool] = useState('');
  if (!open) return <div className="mt-2"><Opener label="Write the executive summary…" onOpen={() => setOpen(true)} /></div>;
  const current = pov.executive_summaries.find((s) => s.lens === lens && s.current);
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="write-summary">
      <GovernedForm<{ executive_summary_id: string }>
        path={`/api/institutions/${pov.institution.id}/executive-summaries`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A summary <strong>written by you</strong>, attributed to you and dated. LVRF writes no prose. {current ? 'It becomes the new version of the current summary for this reader; the old one stays listed.' : 'It is the first summary for this reader.'}</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={LABEL}>Written for</span>
            <select className={INPUT} value={lens} onChange={(e) => setLens(e.target.value as ExecutiveSummary['lens'])}>
              <option value="general">General</option><option value="cfo">CFO</option><option value="chro">CHRO</option><option value="board">Board</option>
            </select></label>
          <label className="block"><span className={LABEL}>Summary</span>
            <textarea rows={4} className={INPUT} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-[12.5px] text-ink">
            <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Drafted with AI (the document will say so)
          </label>
          {ai && <label className="block"><span className={LABEL}>Which tool</span>
            <input className={INPUT} value={tool} onChange={(e) => setTool(e.target.value)} /></label>}
        </div>}
        canSubmit={body.trim().length >= 40 && (!ai || tool.trim().length >= 2)}
        buildBody={() => ({ lens, body, drafted_with_ai: ai, ...(ai ? { drafting_tool: tool } : {}), ...(current ? { supersedes_id: current.id } : {}) })}
        submitLabel="Record the summary"
        onSuccess={() => { setOpen(false); setBody(''); setAi(false); setTool(''); onChanged(); }} renderSuccess={() => <>Recorded.</>} />
    </div>
  );
}

export function SummaryItem({ s }: { s: ExecutiveSummary }) {
  return (
    <li className="border-b border-rule-soft py-2 last:border-b-0" data-testid="summary" data-current={s.current ? 'true' : 'false'}>
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge tone={s.current ? 'solid' : 'neutral'}>{s.lens}</Badge>
        {!s.current && <span className="text-[11px] text-ink-45">earlier version</span>}
      </div>
      <p className={'m-0 mt-1 whitespace-pre-wrap text-[13px] ' + (s.current ? 'text-ink' : 'text-ink-45')}>{s.body}</p>
      <p className="m-0 mt-0.5 text-[11px] text-ink-45">
        Written by {s.author}, {s.created_at.slice(0, 10)}
        {s.drafted_with_ai ? ` · drafted with AI (${s.drafting_tool})` : ' · not AI-drafted'}
      </p>
    </li>
  );
}

function stewardReason(act: string, actor: ReturnType<typeof useActor>['actor']): string | undefined {
  return actor?.is_steward ? undefined : `${act} is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
}

function ReferenceMarkerForm({ pov, current, mode, onChanged }: { pov: Pov; current: ReferenceMarker | null; mode: 'mark' | 'correct' | 'unmark'; onChanged: () => void }) {
  const { actor } = useActor();
  const act = mode === 'mark' ? 'Marking a reference example' : mode === 'correct' ? 'Correcting a reference-example marker' : 'Unmarking a reference example';
  const reason = stewardReason(act, actor);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ kind: current?.kind ?? 'published_case_study', source_citation: current?.source_citation ?? '', note: current?.note ?? '', why: '' });
  const label = mode === 'mark' ? 'Mark as a reference example…' : mode === 'correct' ? 'Correct the marker…' : 'Unmark…';
  if (!open) return <div className="mt-1.5"><Opener label={label} reason={reason} onOpen={() => setOpen(true)} /></div>;
  const path = mode === 'mark' ? `/api/institutions/${pov.institution.id}/reference-example`
    : mode === 'correct' ? `/api/reference-examples/${current!.id}/supersede` : `/api/reference-examples/${current!.id}/retire`;
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid={`marker-${mode}`}>
      <GovernedForm<Record<string, unknown>>
        path={path} provenanceLabel="What this records" disabledReason={reason}
        provenance={<p className="m-0 text-[12.5px] text-ink">{mode === 'unmark'
          ? 'That this account is no longer a reference example, by you, with your reason. The marker stays on the record.'
          : 'That this account is a reference example, not an engagement (O-D3): it renders only as one, and never under the CFO lens.'}</p>}
        fields={mode === 'unmark'
          ? <label className="block"><span className={LABEL}>Why (required)</span><textarea rows={2} className={INPUT} value={v.why} onChange={(e) => setV({ ...v, why: e.target.value })} /></label>
          : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block"><span className={LABEL}>Kind</span>
                <select className={INPUT} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ReferenceMarker['kind'] })}>
                  <option value="published_case_study">Published case study</option><option value="demonstration">Demonstration</option>
                </select></label>
              <label className="block"><span className={LABEL}>Source citation</span><input className={INPUT} value={v.source_citation} onChange={(e) => setV({ ...v, source_citation: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className={LABEL}>Note</span><textarea rows={2} className={INPUT} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
              {mode === 'correct' && <label className="block sm:col-span-2"><span className={LABEL}>Why it is corrected (required)</span><textarea rows={2} className={INPUT} value={v.why} onChange={(e) => setV({ ...v, why: e.target.value })} /></label>}
            </div>}
        canSubmit={mode === 'unmark' ? v.why.trim().length >= 12
          : v.source_citation.trim().length >= 12 && v.note.trim().length >= 12 && (mode === 'mark' || v.why.trim().length >= 12)}
        buildBody={() => mode === 'unmark' ? { retirement_reason: v.why }
          : { kind: v.kind, source_citation: v.source_citation, note: v.note, ...(mode === 'correct' ? { supersession_reason: v.why } : {}) }}
        submitLabel={mode === 'unmark' ? 'Unmark' : mode === 'correct' ? 'Correct the marker' : 'Mark it'}
        onSuccess={() => { setOpen(false); onChanged(); }} renderSuccess={() => <>Recorded.</>} />
    </div>
  );
}

export function PovAuthoring({ institutionId }: { institutionId: string }) {
  const [pov, setPov] = useState<Pov | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchPov(institutionId).then((r) => {
      if (r.status === 'ok') { setPov(r.pov); setError(null); } else setError(r.message);
    });
  }, [institutionId]);
  useEffect(() => { load(); }, [load]);
  if (error) return <Card n="06" title="Hypotheses"><p className="m-0 text-[12.5px] text-critical">{error}</p></Card>;
  if (!pov) return null;
  const marker = pov.reference_example;
  return (
    <>
      <Card n="06" title="Value hypotheses"
        badge={<Link to={`/accounts/${institutionId}/pov`} className={'text-[11px] font-semibold uppercase tracking-[.1em] text-gold-ink hover:text-ink ' + FOCUS_RING}>Open the POV →</Link>}>
        {pov.hypotheses.length === 0
          ? <p className="m-0 text-[12.5px] text-ink-45">No hypothesis stated for this account yet.</p>
          : <ul className="m-0 list-none p-0" data-testid="hypotheses">
              {pov.hypotheses.map((h) => <HypothesisItem key={h.id} h={h} outcome={pov.outcomes.find((o) => o.id === h.value_outcome_id)} onChanged={load} />)}
            </ul>}
        <StateHypothesis pov={pov} onChanged={load} />
      </Card>
      <Card n="07" title="Executive summary">
        {pov.executive_summaries.length === 0
          ? <p className="m-0 text-[12.5px] text-ink-45">No summary written for this account yet.</p>
          : <ul className="m-0 list-none p-0">{pov.executive_summaries.map((s) => <SummaryItem key={s.id} s={s} />)}</ul>}
        <SummaryForm pov={pov} onChanged={load} />
      </Card>
      <Card n="08" title="Reference example" badge={marker ? <Badge tone="solid">reference example</Badge> : undefined}>
        <div data-testid="reference-example">
          {marker
            ? <p className="m-0 text-[12.5px] text-ink">Marked a reference example ({marker.kind.replace(/_/g, ' ')}) by {marker.marked_by}, {marker.marked_at.slice(0, 10)}: {marker.note} <span className="text-ink-45">Source: {marker.source_citation}</span></p>
            : <p className="m-0 text-[12.5px] text-ink-45">Not marked: this account renders as an engagement.</p>}
          {marker
            ? <><ReferenceMarkerForm pov={pov} current={marker} mode="correct" onChanged={load} /><ReferenceMarkerForm pov={pov} current={marker} mode="unmark" onChanged={load} /></>
            : <ReferenceMarkerForm pov={pov} current={null} mode="mark" onChanged={load} />}
          {pov.reference_markers.filter((m) => !m.current).length > 0 && (
            <ul className="m-0 mt-2 list-none p-0 text-[11px] text-ink-45">
              {pov.reference_markers.filter((m) => !m.current).map((m) => (
                <li key={m.id}>Earlier: {m.kind.replace(/_/g, ' ')}, by {m.marked_by}, {m.marked_at.slice(0, 10)} — {m.unmarked_at ? `unmarked by ${m.unmarked_by}: ${m.unmark_reason}` : `corrected: ${m.supersession_reason}`}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}
