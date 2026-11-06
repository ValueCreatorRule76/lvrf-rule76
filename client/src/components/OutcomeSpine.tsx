import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from './GovernedForm';
import { Badge } from './workbench/Card';
import { num } from '../lib/caseFormat';

/**
 * B4 (LVRF_PLAN §14; design §3.2; D1–D3) — card 01d: commit, measure and verify each outcome, and the steward's
 * withdrawals. Every confirmation names the outcome's short id. The database holds each rule (hardening §34): a commit
 * states the method and the class, fixed while it stands; a measurement needs the method and admitted actual evidence;
 * a withdrawal keeps what it withdraws.
 */
interface SpineOutcome {
  id: string; metric: string; unit: string | null; direction: string; engagement: string; engagement_retired: boolean;
  baseline: string; target: string | null; committed_by: string | null; committed_on: string | null;
  attribution_method: string | null; measure_class: string | null; actual: string | null; measured_on: string | null;
  realized: string | null; currency: string | null; realization: string; verified_by: string | null; verified_on: string | null;
  admitted_actual_evidence: boolean;
}
interface Person { id: string; full_name: string; title: string; ineligible: string | null; roles: string | null }

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL = 'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:hover:border-silver disabled:hover:text-ink-45 ' + FOCUS_RING;

const METHOD_LABEL: Record<string, string> = {
  control_group: 'control group (randomised or matched; may say "attributable to")',
  comparison_group: 'comparison group (not randomised; "associated with")',
  trend_adjusted: 'trend-adjusted (change beyond the prior trend)',
  estimate_adjusted: 'estimate-adjusted (participant or manager estimates)',
  contribution_only: 'contribution only (no share claimed)',
};
const CLASS_LABEL: Record<string, string> = {
  capability_performance: 'capability and performance',
  compliance_assurance: 'compliance and risk',
};
const short = (id: string) => id.slice(0, 8);
const withUnit = (v: string | null, unit: string | null) => (v === null ? '' : `${num(v)}${unit ? ` ${unit}` : ''}`);
const today = () => new Date().toISOString().slice(0, 10);

function Commit({ o, persons, onDone }: { o: SpineOutcome; persons: Person[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ target: '', committer: '', on: today(), note: '', method: '', klass: '' });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="commit-open">Commit…</button>;
  const t = /^-?\d+(\.\d+)?$/.test(v.target.trim()) ? v.target.trim() : null;
  const who = persons.find((p) => p.id === v.committer);
  const unmet = [...(t === null ? ['give the target, a number'] : []), ...(who ? [] : ['choose who commits']),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(v.on) ? [] : ['give the date']), ...(v.note.trim().length < 12 ? ['note the commitment, in at least 12 characters'] : []),
    ...(v.method ? [] : ['choose the attribution method']), ...(v.klass ? [] : ['choose the measure class'])];
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="commit">
      <GovernedForm<{ value_outcome_id: string }>
        path={`/api/value-outcomes/${o.id}/commit`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">The target a named person at the account commits to, with the attribution method and the measure class. <strong>The method and the class are fixed while the commitment stands</strong>; changing them means withdrawing it and committing again.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={L}>Target ({o.unit ?? 'unit'})</span><input className={I} inputMode="decimal" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} data-testid="commit-target" /></label>
          <label className="block"><span className={L}>Who commits</span>
            <select className={I} value={v.committer} onChange={(e) => setV({ ...v, committer: e.target.value })} data-testid="commit-committer">
              <option value="">Choose…</option>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `, ${p.title}` : ''}{p.ineligible ? ` (${p.ineligible})` : p.roles ? ` (${p.roles})` : ' (no customer-side role named)'}</option>)}
            </select></label>
          <label className="block"><span className={L}>Committed on</span><input type="date" className={I} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} data-testid="commit-on" /></label>
          <label className="block"><span className={L}>Attribution method</span>
            <select className={I} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })} data-testid="commit-method">
              <option value="">Choose…</option>{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <label className="block"><span className={L}>Measure class</span>
            <select className={I} value={v.klass} onChange={(e) => setV({ ...v, klass: e.target.value })} data-testid="commit-class">
              <option value="">Choose…</option>{Object.entries(CLASS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className={L}>Note</span><textarea rows={2} className={I} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} data-testid="commit-note" /></label>
        </div>}
        confirm={<span data-testid="confirm-text">Commit {short(o.id)}, {o.metric}: target {withUnit(t, o.unit)}, by {who?.full_name ?? ''}, on {v.on}; attribution: {METHOD_LABEL[v.method] ?? ''}; class: {CLASS_LABEL[v.klass] ?? ''}. The method and the class are fixed while the commitment stands.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ target_value: Number(t), committed_by_person_id: v.committer, committed_at: `${v.on}T12:00:00Z`, commitment_note: v.note.trim(), attribution_method: v.method, measure_class: v.klass })}
        submitLabel="Commit" onSuccess={onDone} renderSuccess={() => <>Committed.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function Measure({ o, onDone }: { o: SpineOutcome; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ actual: '', on: today() });
  if (!o.attribution_method) return <p className="m-0 text-[11.5px] text-ink-70" data-testid="measure-blocked">No measurement: no attribution method was stated at commit. Withdraw the commitment and commit again, stating the method.</p>;
  if (!o.admitted_actual_evidence) return <p className="m-0 text-[11.5px] text-ink-70" data-testid="measure-blocked">No measurement yet: link evidence of the actual from a system of record, the client or a published source, on the run page or card 01c, first.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="measure-open">Measure…</button>;
  const a = /^-?\d+(\.\d+)?$/.test(v.actual.trim()) ? v.actual.trim() : null;
  const unmet = [...(a === null ? ['give the actual, a number'] : []), ...(/^\d{4}-\d{2}-\d{2}$/.test(v.on) ? [] : ['give the date'])];
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="measure">
      <GovernedForm<{ value_outcome_id: string }>
        path={`/api/value-outcomes/${o.id}/measure`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">The measured actual, resting on the outcome&apos;s linked evidence of it. Measured is not verified: a named person at the account verifies it next.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={L}>Actual ({o.unit ?? 'unit'})</span><input className={I} inputMode="decimal" value={v.actual} onChange={(e) => setV({ ...v, actual: e.target.value })} data-testid="measure-actual" /></label>
          <label className="block"><span className={L}>Measured on</span><input type="date" className={I} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} data-testid="measure-on" /></label>
        </div>}
        confirm={<span data-testid="confirm-text">Measure {short(o.id)}, {o.metric}: actual {withUnit(a, o.unit)}, measured {v.on}, attribution {METHOD_LABEL[o.attribution_method] ?? o.attribution_method}.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ actual_value: Number(a), actual_measured_at: `${v.on}T12:00:00Z` })}
        submitLabel="Measure" onSuccess={onDone} renderSuccess={() => <>Measured.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function Verify({ o, persons, onDone }: { o: SpineOutcome; persons: Person[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ verifier: '', on: today(), note: '' });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="verify-open">Verify…</button>;
  const who = persons.find((p) => p.id === v.verifier);
  const unmet = [...(who ? [] : ['choose who verifies']), ...(/^\d{4}-\d{2}-\d{2}$/.test(v.on) ? [] : ['give the date']), ...(v.note.trim().length < 12 ? ['note what was checked, in at least 12 characters'] : [])];
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="verify">
      <GovernedForm<{ value_outcome_id: string }>
        path={`/api/value-outcomes/${o.id}/verify`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That a named person at the account checked the measured actual against their own records. The author of a hypothesis on this outcome does not verify it.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={L}>Who verifies</span>
            <select className={I} value={v.verifier} onChange={(e) => setV({ ...v, verifier: e.target.value })} data-testid="verify-verifier">
              <option value="">Choose…</option>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.title ? `, ${p.title}` : ''}{p.ineligible ? ` (${p.ineligible})` : p.roles ? ` (${p.roles})` : ' (no customer-side role named)'}</option>)}
            </select></label>
          <label className="block"><span className={L}>Verified on</span><input type="date" className={I} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} data-testid="verify-on" /></label>
          <label className="block sm:col-span-2"><span className={L}>What was checked</span><textarea rows={2} className={I} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} data-testid="verify-note" /></label>
        </div>}
        confirm={<span data-testid="confirm-text">Verify {short(o.id)}, {o.metric}: actual {withUnit(o.actual, o.unit)}, verified by {who?.full_name ?? ''} on {v.on}.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ verified_by_person_id: v.verifier, verified_at: `${v.on}T13:00:00Z`, attestation_note: v.note.trim() })}
        submitLabel="Verify" onSuccess={onDone} renderSuccess={() => <>Verified.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function WithdrawStep({ o, kind, notSteward, onDone }: { o: SpineOutcome; kind: 'measurement' | 'commitment'; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  if (!open) return <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} className={SMALL} data-testid={`withdraw-${kind}-open`}>Withdraw this {kind}…</button>;
  const unmet = why.trim().length < 12 ? ['say why, in at least 12 characters'] : [];
  const what = kind === 'measurement'
    ? `actual ${withUnit(o.actual, o.unit)}, measured ${o.measured_on ?? ''}${o.realized !== null ? `, realized ${num(o.realized)} ${o.currency ?? '(currency not recorded)'}` : ''}. The outcome reads committed again`
    : `target ${withUnit(o.target, o.unit)}, committed by ${o.committed_by ?? 'no one on record'}. The outcome reads claimed`;
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid={`withdraw-${kind}`}>
      <GovernedForm<{ outcome_withdrawal_id: string }>
        path={`/api/value-outcomes/${o.id}/${kind}/withdraw`} provenanceLabel="What this records" disabledReason={notSteward}
        provenance={<p className="m-0 text-[12.5px] text-ink">That this {kind} is withdrawn, by you, with your reason. <strong>The values withdrawn stay on the record</strong>, exactly as they stood; no sealed run changes.</p>}
        fields={<label className="block"><span className={L}>Why</span><textarea rows={2} className={I} value={why} onChange={(e) => setWhy(e.target.value)} data-testid={`withdraw-${kind}-reason`} /></label>}
        confirm={<span data-testid="confirm-text">Withdraw the {kind} of {short(o.id)}, {o.metric}: {what}; the withdrawn values stay on the record.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ reason: why.trim() })}
        submitLabel={`Withdraw the ${kind}`} onSuccess={onDone} renderSuccess={() => <>Withdrawn.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

export function OutcomeSpine({ institutionId }: { institutionId: string }) {
  const { actor } = useActor();
  const [d, setD] = useState<{ outcomes: SpineOutcome[]; persons: Person[] } | 'error' | null>(null);
  const load = useCallback(() => {
    Promise.all([
      apiFetch(`/api/institutions/${institutionId}/outcome-spine`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      apiFetch(`/api/institutions/${institutionId}/customer-roles`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    ]).then(([s, c]) => setD({ outcomes: (s as { outcomes: SpineOutcome[] }).outcomes, persons: ((c as { persons?: Person[] }).persons ?? []) }), () => setD('error'));
  }, [institutionId]);
  useEffect(load, [load]);
  if (d === null) return <p className="m-0 text-[12.5px] text-ink-45">Reading the outcomes…</p>;
  if (d === 'error') return <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the outcomes.</p>;
  if (d.outcomes.length === 0) return <p className="m-0 text-[12.5px] text-ink-45">No outcome on this account yet; the walk records one at W4.</p>;
  const notSteward = actor?.is_steward ? undefined : `Withdrawing is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  return (
    <ul className="m-0 list-none p-0" data-testid="outcome-spine">
      {d.outcomes.map((o) => (
        <li key={o.id} className="border-b border-rule-soft py-2.5 last:border-b-0" data-testid="spine-outcome" data-outcome={o.id}>
          <div className="flex flex-wrap items-baseline gap-2">
            <Badge tone={o.realization === 'verified' ? 'healthy' : 'warning'}>{o.realization}</Badge>
            <span className="text-[13px] text-ink">{o.metric}</span>
            <span className="font-mono text-[11px] text-ink-45" data-testid="outcome-short-id">{short(o.id)}</span>
          </div>
          <p className="m-0 mt-1 text-[11.5px] text-ink-45">{o.engagement}{o.engagement_retired ? ' (retired)' : ''} · baseline {withUnit(o.baseline, o.unit)}
            {' · '}{o.target !== null ? `target ${withUnit(o.target, o.unit)}, committed by ${o.committed_by ?? 'no one on record'}, ${o.committed_on}` : 'no commitment'}
            {o.target !== null && ` · attribution ${o.attribution_method ? METHOD_LABEL[o.attribution_method] : 'not stated (committed before B4)'} · class ${o.measure_class ? CLASS_LABEL[o.measure_class] : 'not stated'}`}
            {' · '}{o.actual !== null ? `actual ${withUnit(o.actual, o.unit)}, measured ${o.measured_on}` : 'not measured'}
            {o.verified_by ? ` · verified by ${o.verified_by}, ${o.verified_on}` : ''}</p>
          {o.engagement_retired ? <p className="m-0 mt-1 text-[11.5px] text-ink-70">This engagement is retired: its outcomes are frozen.</p> : (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {o.target === null && <Commit o={o} persons={d.persons} onDone={load} />}
                {o.target !== null && o.actual === null && <Measure o={o} onDone={load} />}
                {o.actual !== null && o.realization === 'measured' && <Verify o={o} persons={d.persons} onDone={load} />}
              </div>
              {(o.target !== null) && o.realization !== 'verified' && (
                <div className="mt-1 border-l-[3px] border-warning pl-3" data-testid="danger-zone">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-[.14em] text-warning">Withdrawals: these take a step back on the record</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {o.actual !== null ? <WithdrawStep o={o} kind="measurement" notSteward={notSteward} onDone={load} />
                      : <WithdrawStep o={o} kind="commitment" notSteward={notSteward} onDone={load} />}
                  </div>
                </div>)}
            </div>)}
        </li>))}
    </ul>
  );
}
