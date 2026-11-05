import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from '../components/GovernedForm';
import { Card, Badge } from '../components/workbench/Card';

/**
 * B3 (P6; LVRF_PLAN §19) — /policies: the governed values the value case reads, each the steward's act. Everyone reads;
 * only the steward sets (the server and the database refuse anyone else). The labels and confirmations here are the
 * ones the B3 act session quotes; change one and the act session text changes with it.
 */
interface PolicyValue { id: string; key: string; value: string; reason: string; set_by: string; set_at: string; supersedes_id: string | null; current: boolean }
interface LensPolicy { id: string; persona: string; min_confidence_score: string; admitted_bases: string[]; suppresses: string[]; refusal_text: string; reason: string; ratified_by: string; ratified_at: string; current: boolean }
interface Policies { keys: Record<string, string>; values: PolicyValue[]; lenses: LensPolicy[] }

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL = 'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:hover:border-silver disabled:hover:text-ink-45 ' + FOCUS_RING;
const BASIS_LABEL: Record<string, string> = { system_of_record: 'system of record', published: 'published', client_stated: 'client-stated', inferred: 'inferred', assumed: 'assumed' };
const day = (t: string) => t.slice(0, 10);

/** What a change of each key means for the record, as its confirmation says it. */
const CONSEQUENCE: Record<string, string> = {
  cost_of_delay_months: 'Every cost of delay computed after this reads {v}/12 of the annual value at the committed target; no sealed run changes.',
  pack_ratification_institutions: 'It can be raised later, never lowered; no sealed run changes.',
};

function SetPolicyValue({ keys, values, notSteward, onDone }: { keys: Record<string, string>; values: PolicyValue[]; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} className={SMALL} data-testid="set-policy-open">Set a policy value…</button>;
  const head = values.find((v) => v.key === key && v.current);
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  const unmet = [
    ...(key ? [] : ['choose the policy']),
    ...(n === null ? ['give the value, a whole number'] : []),
    ...(head && n !== null && Number(head.value) === n ? [`it is already ${n}`] : []),
    ...(reason.trim().length < 12 ? ['say why, in at least 12 characters'] : []),
  ];
  const before = head ? `It was ${head.value}, set by ${head.set_by} on ${day(head.set_at)}.` : 'No value was set before.';
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="set-policy">
      <GovernedForm<{ policy_value_id: string }>
        path="/api/policies/values" provenanceLabel="What this records" disabledReason={notSteward}
        provenance={<p className="m-0 text-[12.5px] text-ink">A governed value the value case reads, set by you, with your reason. <strong>No sealed run changes.</strong> The value is a version on the record; a later one supersedes it.</p>}
        fields={<>
          <label className="block"><span className={L}>Policy</span>
            <select className={I} value={key} onChange={(e) => setKey(e.target.value)} data-testid="policy-key">
              <option value="">Choose…</option>
              {Object.entries(keys).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select></label>
          <label className="mt-2 block"><span className={L}>Value</span>
            <input className={I} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} data-testid="policy-value" /></label>
          <label className="mt-2 block"><span className={L}>Reason</span>
            <textarea rows={3} className={I} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="policy-reason" /></label>
        </>}
        confirm={<span data-testid="confirm-text">Set {keys[key]} to {n}. {before} {(CONSEQUENCE[key] ?? '').replace('{v}', String(n))}</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ key, value: n, reason: reason.trim() })}
        submitLabel="Set the value" onSuccess={onDone} renderSuccess={() => <>Set.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function RatifyLens({ current, notSteward, onDone }: { current: LensPolicy | undefined; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState('');
  const [min, setMin] = useState('');
  const [bases, setBases] = useState<string[]>([]);
  const [consumption, setConsumption] = useState(false);
  const [refusal, setRefusal] = useState('');
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} className={SMALL} data-testid="ratify-lens-open">Ratify a lens policy…</button>;
  const m = /^\d+(\.\d)?$/.test(min.trim()) ? Number(min.trim()) : null;
  const unmet = [
    ...(persona ? [] : ['choose the persona']),
    ...(m === null || m > 100 ? ['give the minimum computed confidence, from 0 to 100'] : []),
    ...(bases.length ? [] : ['admit at least one basis for an actual']),
    ...(refusal.trim().length < 24 ? ['write the refusal text, in at least 24 characters'] : []),
    ...(reason.trim().length < 12 ? ['say why, in at least 12 characters'] : []),
  ];
  const order = ['system_of_record', 'published', 'client_stated', 'inferred', 'assumed'];
  const admitted = order.filter((b) => bases.includes(b)).map((b) => BASIS_LABEL[b]);
  const admittedText = admitted.length <= 1 ? admitted.join('') : `${admitted.slice(0, -1).join(', ')} and ${admitted[admitted.length - 1]}`;
  const before = current ? `It replaces the CFO lens ratified by ${current.ratified_by} on ${day(current.ratified_at)}.` : 'No CFO lens was ratified before.';
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="ratify-lens">
      <GovernedForm<{ lens_policy_id: string }>
        path="/api/policies/lenses" provenanceLabel="What this records" disabledReason={notSteward}
        provenance={<p className="m-0 text-[12.5px] text-ink">A lens policy ratified by you: who may read a value case through it, and what it refuses. <strong>No sealed run changes</strong>; the lens is applied when a case is read.</p>}
        fields={<>
          <label className="block"><span className={L}>Persona</span>
            <select className={I} value={persona} onChange={(e) => setPersona(e.target.value)} data-testid="lens-persona">
              <option value="">Choose…</option><option value="cfo">CFO</option>
            </select></label>
          <label className="mt-2 block"><span className={L}>Minimum computed confidence</span>
            <input className={I} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} data-testid="lens-min" /></label>
          <fieldset className="mt-2"><legend className={L}>Admitted bases for an actual</legend>
            {order.map((b) => (
              <label key={b} className="mr-3 inline-flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={bases.includes(b)} onChange={(e) => setBases(e.target.checked ? [...bases, b] : bases.filter((x) => x !== b))} data-testid={`lens-basis-${b}`} />{BASIS_LABEL[b]}</label>))}
          </fieldset>
          <fieldset className="mt-2"><legend className={L}>Suppresses</legend>
            <label className="inline-flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={consumption} onChange={(e) => setConsumption(e.target.checked)} data-testid="lens-suppress-consumption" />consumption metrics</label>
          </fieldset>
          <label className="mt-2 block"><span className={L}>Refusal text</span>
            <textarea rows={3} className={I} value={refusal} onChange={(e) => setRefusal(e.target.value)} data-testid="lens-refusal" /></label>
          <label className="mt-2 block"><span className={L}>Reason</span>
            <textarea rows={3} className={I} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="lens-reason" /></label>
        </>}
        confirm={<span data-testid="confirm-text">Ratify the CFO lens: at least {m}, admitting {admittedText} actuals{consumption ? ', suppressing consumption metrics' : ''}. {before} Every value case read under the CFO lens after this applies it; no sealed run changes.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ persona, min_confidence_score: m, admitted_bases: bases, suppresses: consumption ? ['consumption'] : [], refusal_text: refusal.trim(), reason: reason.trim() })}
        submitLabel="Ratify the lens" onSuccess={onDone} renderSuccess={() => <>Ratified.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

export function PoliciesPage() {
  const { actor } = useActor();
  const [d, setD] = useState<Policies | 'error' | null>(null);
  const load = useCallback(() => {
    apiFetch('/api/policies').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j) => setD(j as Policies), () => setD('error'));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (d === null) return <p className="p-8 text-ink-45">loading</p>;
  if (d === 'error') return <p className="p-8 text-ink-70">Couldn&apos;t load the policies. Reload the page to try again.</p>;
  const notSteward = actor?.is_steward ? undefined : `Only the steward (${actor?.steward_name ?? 'the tenant’s steward'}) sets these.`;
  const cfo = d.lenses.find((l) => l.persona === 'cfo' && l.current);
  return (
    <div className="mx-auto max-w-4xl px-4 pb-14 pt-6 sm:px-[30px]" data-testid="policies">
      <header className="mb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Policies</span>
        <h1 className="m-0 my-1.5 font-display text-[34px] leading-[1] tracking-[.012em]">What the value case reads</h1>
        <p className="m-0 text-[12.5px] text-ink-45">Each value is the steward&apos;s act, a version on the record. With none set, the case says so; nothing falls back to a default.</p>
      </header>
      <Card title="Policy values" badge={<Badge tone="neutral">{d.values.filter((v) => v.current).length} set</Badge>}>
        <ul className="m-0 list-none p-0" data-testid="policy-values">
          {Object.entries(d.keys).map(([k, label]) => {
            const head = d.values.find((v) => v.key === k && v.current);
            const history = d.values.filter((v) => v.key === k && !v.current);
            return (
              <li key={k} className="border-b border-rule-soft py-2.5 last:border-b-0" data-testid="policy-value-row" data-key={k}>
                <p className="m-0 text-[13px] text-ink"><strong>{label}:</strong> {head ? head.value : <span className="text-ink-45">not set</span>}</p>
                {head && <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">Set by {head.set_by} on {day(head.set_at)}: {head.reason}</p>}
                {history.length > 0 && <p className="m-0 mt-0.5 text-[11px] text-ink-45">Earlier: {history.map((v) => `${v.value} (${day(v.set_at)})`).join(', ')}</p>}
              </li>);
          })}
        </ul>
        <div className="mt-3"><SetPolicyValue keys={d.keys} values={d.values} notSteward={notSteward} onDone={load} /></div>
      </Card>
      <Card title="The CFO lens" badge={<Badge tone={cfo ? 'neutral' : 'warning'}>{cfo ? 'ratified' : 'not ratified'}</Badge>}>
        {cfo ? (
          <div data-testid="lens-current">
            <p className="m-0 text-[13px] text-ink">At least <strong>{cfo.min_confidence_score}</strong> computed confidence; admits {cfo.admitted_bases.map((b) => BASIS_LABEL[b] ?? b).join(', ')} actuals{cfo.suppresses.includes('consumption') ? '; suppresses consumption metrics' : ''}.</p>
            <p className="m-0 mt-1 text-[12px] text-ink-70">Refusal text: “{cfo.refusal_text}”</p>
            <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">Ratified by {cfo.ratified_by} on {day(cfo.ratified_at)}: {cfo.reason}</p>
          </div>
        ) : <p className="m-0 text-[12.5px] text-ink-45" data-testid="lens-none">No CFO lens is ratified, so every case refuses under the CFO lens and says why.</p>}
        <div className="mt-3"><RatifyLens current={cfo} notSteward={notSteward} onDone={load} /></div>
      </Card>
    </div>
  );
}
