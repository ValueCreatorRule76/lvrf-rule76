import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { Card, Badge } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import { AddEvidenceCard } from './workbench/AddEvidenceCard';

/**
 * Q4c2 — the outside-in walk on the account page (LVRF_PLAN §4c, approved
 * by Brad 12 Oct). Every step is an EXISTING write route under the session;
 * this card only orders them and shows which is done, which is next, and
 * what each waits for. Nothing is prefilled from a source: the person types
 * every figure and every citation.
 *
 *   W1 analyst of record       POST /api/institutions/:id/inputs
 *   W2 offering + capability   POST /api/institutions/:id/offerings
 *   W3 claim on a pack entry   POST /api/capabilities/:id/industry-measures (confounders shown)
 *   W4 value outcome           POST /api/institutions/:id/value-outcomes   (baseline; NO target)
 *   W5 pack basis              POST /api/business-metrics/:id/pack-basis
 *   W6 evidence                POST /api/value-outcomes/:id/evidence       (before the first run)
 *   W7 produce the run         POST /api/engagements/:id/produce-run
 *   W8 lock it                 POST /api/value-runs/:id/lock
 *   W9 retire the engagement   POST /api/engagements/:id/retire            STEWARD-ONLY
 *
 * Read: GET /api/institutions/:id/walk.
 */

interface WalkState {
  institution: { id: string; name: string; industry_slug: string | null; industry_name: string | null };
  persons: { id: string; full_name: string; email: string; title: string | null }[];
  offerings: { offering_key: string; name: string; family: string }[];
  pack: { id: string; name: string; unit: string; direction: string; definition: string; confounders: string; addressable: boolean }[];
  capabilities: { id: string; name: string; claims: { industry_measure_id: string; measure_name: string; claim: string; claimed_by: string | null }[] }[];
  engagements: {
    id: string; name: string; status: string; retired: boolean;
    outcomes: {
      id: string; baseline_value: string; baseline_measured_at: string; target_value: string | null; realization: string; confidence: string;
      capability_name: string | null;
      metric: { id: string; name: string; unit: string; direction: string; source_system: string; industry_measure_id: string | null };
      evidence: { id: string; kind: string; supports: string; summary: string; basis: string | null }[];
    }[];
    runs: { id: string; run_number: number; locked_at: string | null; confidence_band: string }[];
  }[];
}

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';

type StepState = 'done' | 'next' | 'waiting';

function Step({ id, title, state, waitsFor, children, testId }: {
  id: string; title: string; state: StepState; waitsFor?: string; children: ReactNode; testId: string;
}) {
  return (
    <div className="border-b border-rule-soft py-4 last:border-b-0" data-testid={testId} data-state={state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 text-[13.5px] font-semibold text-ink"><span className="mr-1.5 font-mono text-gold-ink">{id}</span>{title}</h4>
        <Badge tone={state === 'done' ? 'healthy' : state === 'next' ? 'watch' : 'neutral'}>
          {state === 'done' ? 'Done' : state === 'next' ? 'Next' : 'Waiting'}
        </Badge>
      </div>
      {state === 'waiting' ? <p className="m-0 mt-1 text-[12px] text-ink-45">Waits for: {waitsFor}</p> : <div className="mt-2">{children}</div>}
    </div>
  );
}

const field = (label: string, el: ReactNode, help?: string, wide = false) => (
  <label className={'block' + (wide ? ' sm:col-span-2' : '')}>
    <span className={LABEL_CLASS}>{label}</span>
    {el}
    {help && <p className={HELP_CLASS}>{help}</p>}
  </label>
);

export function OutsideInWalk({ institutionId, onChanged }: { institutionId: string; onChanged: () => void }) {
  const { actor } = useActor();
  const [tick, setTick] = useState(0);
  const [w, setW] = useState<WalkState | { error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/walk`)
      .then(async (r) => { const b = await r.json().catch(() => null); return r.ok ? (b as WalkState) : { error: b?.message ?? `HTTP ${r.status}` }; })
      .catch((e) => ({ error: e instanceof Error ? e.message : 'network error' }))
      .then((v) => { if (!cancelled) setW(v); });
    return () => { cancelled = true; };
  }, [institutionId, tick]);
  const reload = () => { setTick((t) => t + 1); onChanged(); };

  // Form state, one object per step.
  const [p1, setP1] = useState({ full_name: '', email: '', title: '' });
  const [p2, setP2] = useState({ offering_key: '', capability_name: '', owner_person_id: '', basis: '' });
  const [p3, setP3] = useState({ capability_id: '', industry_measure_id: '', claim: '' });
  const [p4, setP4] = useState({ engagement_name: '', owner: '', metric_name: '', unit: '', direction: '', source_system: '', capability_name: '', baseline_value: '', baseline_measured_at: '' });
  const [p5, setP5] = useState({ industry_measure_id: '', basis_note: '' });
  const [p7, setP7] = useState({ banner_title: 'OUTSIDE-IN HYPOTHESIS', note: '', source_fixture: '' });
  const [p8, setP8] = useState({ lock_reason: '' });
  const [p9, setP9] = useState({ retirement_reason: '' });

  if (!w) return <Card n="W" title="Outside-in walk"><p className="m-0 text-ink-45">loading</p></Card>;
  if ('error' in w) return <Card n="W" title="Outside-in walk"><p className="m-0 text-critical">{w.error}</p></Card>;

  const claims = w.capabilities.flatMap((c) => c.claims.map((cl) => ({ ...cl, capability_id: c.id, capability_name: c.name })));
  // The engagement walked here: the latest one with an outcome.
  const eng = [...w.engagements].reverse().find((e) => e.outcomes.length > 0) ?? null;
  const outcome = eng?.outcomes[eng.outcomes.length - 1] ?? null;
  const lockedRun = eng?.runs.find((r) => r.locked_at) ?? null;
  const openRun = eng ? [...eng.runs].reverse().find((r) => !r.locked_at) ?? null : null;
  const hasBaselineEvidence = Boolean(outcome?.evidence.some((e) => e.supports === 'baseline'));
  const stewardReason = actor?.is_steward ? undefined : `Retiring an engagement is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone (3.0 Band A).`;

  const s1: StepState = w.persons.length > 0 ? 'done' : 'next';
  const s2: StepState = w.capabilities.length > 0 ? 'done' : s1 === 'done' ? 'next' : 'waiting';
  const s3: StepState = claims.length > 0 ? 'done' : s2 === 'done' ? (w.pack.length ? 'next' : 'waiting') : 'waiting';
  const s4: StepState = outcome ? 'done' : s3 === 'done' ? 'next' : 'waiting';
  const s5: StepState = outcome?.metric.industry_measure_id ? 'done' : s4 === 'done' ? 'next' : 'waiting';
  const s6: StepState = hasBaselineEvidence ? 'done' : s5 === 'done' ? 'next' : 'waiting';
  const s7: StepState = eng && eng.runs.length > 0 ? 'done' : s6 === 'done' ? 'next' : 'waiting';
  const s8: StepState = lockedRun ? 'done' : s7 === 'done' ? 'next' : 'waiting';
  const s9: StepState = eng?.retired ? 'done' : s8 === 'done' ? 'next' : 'waiting';
  const chosen = w.pack.find((m) => m.id === p3.industry_measure_id);
  const claimedForBasis = claims.filter((c) => outcome && c.capability_name === outcome.capability_name);

  return (
    <Card n="W" title="Outside-in walk" badge={<Badge tone="neutral">{w.institution.industry_name ?? 'Unclassified'}</Badge>}>
      <p className="m-0 mb-2 max-w-[85ch] text-[12.5px] text-ink-45">
        A hypothesis from published material, step by step. Each step is an existing governed write; nothing is prefilled from
        a source. A hypothesis with no target is complete: never derive a target from a vendor claim.
      </p>
      <div data-testid="outside-in-walk">
        <Step id="W1" title="Analyst of record (a person on this account)" state={s1} testId="w1">
          {w.persons.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{w.persons.map((p) => `${p.full_name}${p.title ? ` — ${p.title}` : ''}`).join('; ')}</p>}
          {s1 === 'next' && (
            <GovernedForm<{ person_ids: string[] }>
              path={`/api/institutions/${institutionId}/inputs`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">A customer-side person on this account, named as the owner of what is asserted from published material (Curia's precedent: "external analyst of record").</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Full name', <input className={INPUT_CLASS} value={p1.full_name} onChange={(e) => setP1({ ...p1, full_name: e.target.value })} />)}
                {field('Email (required by the route)', <input className={INPUT_CLASS} value={p1.email} onChange={(e) => setP1({ ...p1, email: e.target.value })} />)}
                {field('Title', <input className={INPUT_CLASS} value={p1.title} onChange={(e) => setP1({ ...p1, title: e.target.value })} />, 'e.g. "External analyst of record — not an employee. Asserting from published material."', true)}
              </div>}
              canSubmit={p1.full_name.trim() !== '' && p1.email.trim() !== ''}
              buildBody={() => ({ persons: [{ full_name: p1.full_name, email: p1.email, title: p1.title || null }] })}
              submitLabel="Add the person" onSuccess={reload} renderSuccess={() => <>Added.</>} />
          )}
        </Step>

        <Step id="W2" title="Offering and capability" state={s2} waitsFor="W1, a person to own the capability" testId="w2">
          {w.capabilities.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{w.capabilities.map((c) => c.name).join('; ')}</p>}
          {s2 === 'next' && (
            <GovernedForm<{ capability_id: string }>
              path={`/api/institutions/${institutionId}/offerings`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">An offering attached to this account, and the capability it builds. The basis says why; state the solution (e.g. "EHS solution").</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Offering', <select className={INPUT_CLASS} value={p2.offering_key} onChange={(e) => setP2({ ...p2, offering_key: e.target.value })}>
                  <option value="">— choose —</option>{w.offerings.map((o) => <option key={o.offering_key} value={o.offering_key}>{o.name}</option>)}</select>)}
                {field('Owner', <select className={INPUT_CLASS} value={p2.owner_person_id} onChange={(e) => setP2({ ...p2, owner_person_id: e.target.value })}>
                  <option value="">— choose —</option>{w.persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
                {field('Capability name', <input className={INPUT_CLASS} value={p2.capability_name} onChange={(e) => setP2({ ...p2, capability_name: e.target.value })} />, undefined, true)}
                {field('Basis', <textarea rows={2} className={INPUT_CLASS} value={p2.basis} onChange={(e) => setP2({ ...p2, basis: e.target.value })} />, undefined, true)}
              </div>}
              canSubmit={!!p2.offering_key && !!p2.owner_person_id && p2.capability_name.trim() !== '' && p2.basis.trim().length >= 12}
              buildBody={() => ({ offering_key: p2.offering_key, capability_name: p2.capability_name, owner_person_id: p2.owner_person_id, is_primary: false, basis: p2.basis })}
              submitLabel="Attach" onSuccess={reload} renderSuccess={() => <>Attached.</>} />
          )}
        </Step>

        <Step id="W3" title="The capability's claim on a pack entry" state={s3}
          waitsFor={s2 !== 'done' ? 'W2, a capability' : `a pack: classify the account into an industry with entries`} testId="w3">
          {claims.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{claims.map((c) => `${c.capability_name} → ${c.measure_name}`).join('; ')} <span className="text-ink-45">(a claim is not amended)</span></p>}
          {s3 === 'next' && (
            <GovernedForm<{ id: string }>
              path={`/api/capabilities/${p3.capability_id}/industry-measures`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">That this capability plausibly moves this pack entry: the mechanism, in your words. Final: a claim is not amended.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Capability', <select className={INPUT_CLASS} value={p3.capability_id} onChange={(e) => setP3({ ...p3, capability_id: e.target.value })}>
                  <option value="">— choose —</option>{w.capabilities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
                {field('Pack entry', <select className={INPUT_CLASS} value={p3.industry_measure_id} onChange={(e) => setP3({ ...p3, industry_measure_id: e.target.value })}>
                  <option value="">— choose —</option>{w.pack.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>)}
                {chosen && (
                  <div className="sm:col-span-2" data-testid="claim-confounders">
                    <p className="m-0 text-[12px] text-ink-45">{chosen.definition} <span className="font-mono">({chosen.unit} · {chosen.direction})</span></p>
                    <div className="mt-2 border-l-2 border-gold pl-3">
                      <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-gold-ink">What moves this that is NOT capability</span>
                      <p className="m-0 mt-1 text-[12.5px] text-ink-45">{chosen.confounders}</p>
                    </div>
                  </div>
                )}
                {field('Claim (the mechanism)', <textarea rows={3} className={INPUT_CLASS} value={p3.claim} onChange={(e) => setP3({ ...p3, claim: e.target.value })} />, undefined, true)}
              </div>}
              canSubmit={!!p3.capability_id && !!p3.industry_measure_id && p3.claim.trim() !== ''}
              buildBody={() => ({ industry_measure_id: p3.industry_measure_id, claim: p3.claim })}
              submitLabel="Record the claim" onSuccess={reload} renderSuccess={() => <>Claimed.</>} />
          )}
        </Step>

        <Step id="W4" title="The value outcome, with its published baseline" state={s4} waitsFor="W3, a claim" testId="w4">
          {outcome && (
            <p className="m-0 mb-2 text-[12.5px] text-ink">
              {eng!.name}: {outcome.metric.name}, baseline <strong>{Number(outcome.baseline_value)}</strong> {outcome.metric.unit} at {outcome.baseline_measured_at.slice(0, 10)} ·
              target {outcome.target_value === null ? 'none (a hypothesis)' : Number(outcome.target_value)} · {outcome.realization}, {outcome.confidence}
            </p>
          )}
          {s4 === 'next' && (
            <GovernedForm<{ value_outcome_id: string }>
              path={`/api/institutions/${institutionId}/value-outcomes`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">The engagement, its metric, and the baseline as published. <strong>No target is offered:</strong> a hypothesis with no target is complete, and a target derived from a vendor claim would invent its terms. Zero is a value.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Engagement name', <input className={INPUT_CLASS} value={p4.engagement_name} onChange={(e) => setP4({ ...p4, engagement_name: e.target.value })} />, 'e.g. "<Account> — reference example, not an engagement"', true)}
                {field('Owner', <select className={INPUT_CLASS} value={p4.owner} onChange={(e) => setP4({ ...p4, owner: e.target.value })}>
                  <option value="">— choose —</option>{w.persons.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>)}
                {field('Capability', <select className={INPUT_CLASS} value={p4.capability_name} onChange={(e) => setP4({ ...p4, capability_name: e.target.value })}>
                  <option value="">— choose —</option>{w.capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>)}
                {field('Metric name', <input className={INPUT_CLASS} value={p4.metric_name} onChange={(e) => setP4({ ...p4, metric_name: e.target.value })} />)}
                {field('Unit, as the source states it', <input className={INPUT_CLASS} value={p4.unit} onChange={(e) => setP4({ ...p4, unit: e.target.value })} />)}
                {field('Direction', <select className={INPUT_CLASS} value={p4.direction} onChange={(e) => setP4({ ...p4, direction: e.target.value })}>
                  <option value="">— choose —</option><option value="increase">increase</option><option value="decrease">decrease</option></select>)}
                {field('Source system (the publication)', <input className={INPUT_CLASS} value={p4.source_system} onChange={(e) => setP4({ ...p4, source_system: e.target.value })} />)}
                {field('Baseline value', <input type="number" step="any" className={INPUT_CLASS} value={p4.baseline_value} onChange={(e) => setP4({ ...p4, baseline_value: e.target.value })} />, 'As published. 0 is a value.')}
                {field('Baseline measured at (the period end)', <input type="date" className={INPUT_CLASS} value={p4.baseline_measured_at} onChange={(e) => setP4({ ...p4, baseline_measured_at: e.target.value })} />)}
              </div>}
              canSubmit={p4.engagement_name.trim() !== '' && !!p4.owner && !!p4.capability_name && p4.metric_name.trim() !== '' && p4.unit.trim() !== ''
                && !!p4.direction && p4.source_system.trim() !== '' && p4.baseline_value.trim() !== '' && Number.isFinite(Number(p4.baseline_value)) && !!p4.baseline_measured_at}
              buildBody={() => ({
                engagement_name: p4.engagement_name, engagement_owner_person_id: p4.owner, capability_name: p4.capability_name,
                metric: { name: p4.metric_name, unit: p4.unit, direction: p4.direction, source_system: p4.source_system, owner_person_id: p4.owner },
                baseline_value: Number(p4.baseline_value), baseline_measured_at: `${p4.baseline_measured_at}T00:00:00Z`,
              })}
              submitLabel="Record the outcome" onSuccess={reload} renderSuccess={() => <>Recorded.</>} />
          )}
        </Step>

        <Step id="W5" title="The metric's pack basis" state={s5} waitsFor="W4, an outcome and its metric" testId="w5">
          {outcome?.metric.industry_measure_id && <p className="m-0 mb-2 text-[12.5px] text-ink">{outcome.metric.name} → {w.pack.find((m) => m.id === outcome.metric.industry_measure_id)?.name ?? outcome.metric.industry_measure_id} <span className="text-ink-45">(a basis is not amended)</span></p>}
          {s5 === 'next' && outcome && (
            <GovernedForm<{ metric_id: string }>
              path={`/api/business-metrics/${outcome.metric.id}/pack-basis`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">That this account's metric is an instance of the pack entry its capability claims. Before this, check the units match. Final: a basis is not amended.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Pack entry (claimed by this capability)', <select className={INPUT_CLASS} value={p5.industry_measure_id} onChange={(e) => setP5({ ...p5, industry_measure_id: e.target.value })}>
                  <option value="">— choose —</option>{claimedForBasis.map((c) => <option key={c.industry_measure_id} value={c.industry_measure_id}>{c.measure_name}</option>)}</select>)}
                {field('Basis note', <textarea rows={2} className={INPUT_CLASS} value={p5.basis_note} onChange={(e) => setP5({ ...p5, basis_note: e.target.value })} />, undefined, true)}
              </div>}
              canSubmit={!!p5.industry_measure_id && p5.basis_note.trim() !== ''}
              buildBody={() => ({ industry_measure_id: p5.industry_measure_id, basis_note: p5.basis_note })}
              submitLabel="Set the basis" onSuccess={reload} renderSuccess={() => <>Set.</>} />
          )}
        </Step>

        <Step id="W6" title="Evidence: the baseline, and any vendor claim" state={s6} waitsFor="W5, the pack basis" testId="w6">
          {outcome && outcome.evidence.length > 0 && (
            <ul className="m-0 mb-2 list-none p-0">{outcome.evidence.map((e) => <li key={e.id} className="py-0.5 text-[12px] text-ink">{e.kind} · supports {e.supports}{e.basis ? ` · basis ${e.basis.replace(/_/g, ' ')}` : ''} — <span className="text-ink-45">{e.summary}</span></li>)}</ul>
          )}
          {s6 !== 'waiting' && outcome && lockedRun && (
            <p className="m-0 text-[11.5px] text-ink-45">The run is locked: evidence added now would not be in it. A new run is a later, separate act.</p>
          )}
          {s6 !== 'waiting' && outcome && !lockedRun && (
            <>
              <p className="m-0 mb-2 text-[11.5px] text-ink-45">
                The baseline: <code>public_filing</code>, supports <code>baseline</code>, quoting the series and the company's own reasons.
                A vendor's claim: <code>vendor_publication</code>, supports <code>impact_basis</code> — never the actual (refused by the database).
              </p>
              <AddEvidenceCard key={`ev-${outcome.evidence.length}`} n="W6" outcomeId={outcome.id} onRecorded={reload} />
            </>
          )}
        </Step>

        <Step id="W7" title="Produce the run" state={s7} waitsFor="W6, the baseline's evidence" testId="w7">
          {eng && eng.runs.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{eng.runs.map((r) => <Link key={r.id} to={`/runs/${r.id}`} className={'mr-2 text-gold-ink ' + FOCUS_RING}>Run {r.run_number} ({r.confidence_band}{r.locked_at ? ', locked' : ''})</Link>)}</p>}
          {s7 === 'next' && eng && (
            <GovernedForm<{ value_run_id: string }>
              path={`/api/engagements/${eng.id}/produce-run`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">A run: the outcome, its evidence and its confidence, snapshotted. Not locked until W8.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Banner', <input className={INPUT_CLASS} value={p7.banner_title} onChange={(e) => setP7({ ...p7, banner_title: e.target.value })} />)}
                {field('Note (required)', <input className={INPUT_CLASS} value={p7.note} onChange={(e) => setP7({ ...p7, note: e.target.value })} />, 'What this run is, e.g. "Outside-in hypothesis from published material".')}
                {field('Run source label (required)', <input className={INPUT_CLASS} value={p7.source_fixture} onChange={(e) => setP7({ ...p7, source_fixture: e.target.value })} />, 'Names the material this run was walked from, so a document cannot carry another engagement\'s numbers. Curia\'s: curia_outside_in.')}
              </div>}
              canSubmit={p7.banner_title.trim() !== '' && p7.note.trim() !== '' && p7.source_fixture.trim() !== ''}
              buildBody={() => ({ banner_title: p7.banner_title, note: p7.note, source_fixture: p7.source_fixture })}
              submitLabel="Produce" onSuccess={reload} renderSuccess={() => <>Produced.</>} />
          )}
        </Step>

        <Step id="W8" title="Lock the run" state={s8} waitsFor="W7, a run" testId="w8">
          {lockedRun && <p className="m-0 mb-2 text-[12.5px] text-ink">Run {lockedRun.run_number} locked {lockedRun.locked_at!.slice(0, 10)}. A locked run cannot change.</p>}
          {s8 === 'next' && openRun && (
            <GovernedForm<{ run_id: string }>
              path={`/api/value-runs/${openRun.id}/lock`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">Locking run {openRun.run_number} is final: the run cannot change.</p>}
              fields={field('Lock reason', <textarea rows={2} className={INPUT_CLASS} value={p8.lock_reason} onChange={(e) => setP8({ lock_reason: e.target.value })} />)}
              canSubmit={p8.lock_reason.trim() !== ''}
              buildBody={() => ({ lock_reason: p8.lock_reason })}
              submitLabel="Lock" onSuccess={reload} renderSuccess={() => <>Locked.</>} />
          )}
        </Step>

        <Step id="W9" title="Retire the reference engagement (the cohort decision)" state={s9} waitsFor="W8, a locked run" testId="w9">
          {eng?.retired && <p className="m-0 mb-2 text-[12.5px] text-ink">{eng.name}: retired. Its runs keep their account.</p>}
          {s9 === 'next' && eng && (
            <GovernedForm<{ engagement_id: string }>
              path={`/api/engagements/${eng.id}/retire`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">A reference example is not an engagement: retired once its run is locked, so the cohort does not count it. Runs are kept.</p>}
              disabledReason={stewardReason}
              fields={field('Why it is being retired', <textarea rows={2} className={INPUT_CLASS} value={p9.retirement_reason} onChange={(e) => setP9({ retirement_reason: e.target.value })} />)}
              canSubmit={p9.retirement_reason.trim().length >= 12}
              buildBody={() => ({ retirement_reason: p9.retirement_reason })}
              submitLabel="Retire the engagement" onSuccess={reload} renderSuccess={() => <>Retired.</>} />
          )}
        </Step>
      </div>
    </Card>
  );
}
