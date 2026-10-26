import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { Card, Badge } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import { AddEvidenceCard } from './workbench/AddEvidenceCard';
import { EvidenceRestsOn, FigureCheckLine } from './EvidenceRestsOn';
import { supportsChoices, supportsShort } from '../lib/labels';
import { deriveWalk, walkStatus, type StepState, type WalkState, type WalkStatus } from '../lib/workspaceStatus';

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


const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';


/** Render here, or into the workspace step that owns this part (one instance, one state). */
const place = (target: Element | null | undefined, node: ReactNode) => (target ? createPortal(node, target) : node);

type WalkEvidence = WalkState['engagements'][number]['outcomes'][number]['evidence'][number];

/**
 * Q4k (Q4k-D1): "Open the citation…" on AI-sourced outcome evidence. A named
 * person — the recorder may — opens the cited source and says whether it
 * supports what the evidence states. Recorded with who and when, final;
 * ai_sourced stays true. A run produced before this keeps the state it sealed.
 */
function OpenCitation({ e, onOpened }: { e: WalkEvidence; onOpened: () => void }) {
  const [open, setOpen] = useState(false);
  const [supports, setSupports] = useState<'' | 'true' | 'false'>('');
  if (!e.ai_sourced) return null;
  if (e.citation_resolved) {
    return (
      <span className="ml-1 text-[11px] text-ink-45" data-testid="citation-opened">
        · AI-sourced · citation opened by {e.citation_resolved_by}, {e.citation_resolved_at} · {e.source_verified ? 'source verified' : 'unverified'}
      </span>
    );
  }
  if (!open) {
    return (
      <span className="ml-1 inline-flex items-center gap-2 text-[11px] text-ink-45">
        · AI-sourced · citation not yet opened
        <button type="button" onClick={() => setOpen(true)}
          className={'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' + FOCUS_RING}>
          Open the citation…
        </button>
      </span>
    );
  }
  return (
    <div className="mt-1.5 border-t border-rule-soft pt-2" data-testid="open-citation">
      <GovernedForm<{ evidence_id: string }>
        path={`/api/evidence/${e.id}/open-citation`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That you opened the cited source of this AI-sourced evidence, with your name and the time. It is <strong>final</strong>, and the evidence stays marked AI-sourced. A run already produced keeps the state it sealed.</p>}
        fields={<label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Does the source say what this evidence states?</span>
          <select className={INPUT_CLASS} value={supports} onChange={(ev) => setSupports(ev.target.value as '' | 'true' | 'false')}>
            <option value="" disabled>— choose —</option>
            <option value="true">Yes — the source is verified</option>
            <option value="false">No — opened, and it stays unverified</option>
          </select>
        </label>}
        canSubmit={supports !== ''}
        buildBody={() => ({ source_verified: supports === 'true' })}
        submitLabel="Record the opened citation" onSuccess={onOpened} renderSuccess={() => <>Recorded.</>} />
    </div>
  );
}


/**
 * C1 (LVRF_PLAN §9): the steward corrects what a link supports. The old link
 * is withdrawn (who, when, why) and a new one recorded, in one transaction;
 * allowed on a retired engagement's frozen outcome. A sealed run is unchanged
 * — an erratum on the run page records what it sealed wrongly.
 */
function CorrectSupport({ e, outcomeId, onDone }: { e: WalkEvidence; outcomeId: string; onDone: () => void }) {
  const { actor } = useActor();
  const [open, setOpen] = useState(false);
  const [supports, setSupports] = useState('');
  const [reason, setReason] = useState('');
  const notSteward = actor?.is_steward ? undefined : `Correcting what a link supports is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  if (!open) {
    return (
      <span className="ml-1 inline-flex items-center gap-2 text-[11px] text-ink-45">
        <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} data-testid="correct-support-open"
          className={'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:hover:border-silver disabled:hover:text-ink-45 ' + FOCUS_RING}>
          Correct what it supports…
        </button>
        {notSteward && <span data-testid="correct-support-reason">{notSteward}</span>}
      </span>
    );
  }
  const unmet = [...(supports === '' ? ['choose what it supports'] : []), ...(reason.trim().length < 12 ? ['give the reason, in at least 12 characters'] : [])];
  return (
    <div className="mt-1.5 border-t border-rule-soft pt-2" data-testid="correct-support">
      <GovernedForm<{ supports: string }>
        path={`/api/value-outcomes/${outcomeId}/evidence/${e.id}/correct-support`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">This link, supporting <strong>{supportsShort(e.supports)}</strong>, is <strong>withdrawn</strong> with your name, the date and your reason, and stays shown struck through. A new link records what it supports instead. <strong>A sealed run is not changed</strong>; record an erratum on it.</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={LABEL_CLASS}>What it supports</span>
            <select className={INPUT_CLASS} value={supports} onChange={(ev) => setSupports(ev.target.value)}>
              <option value="" disabled>— choose —</option>
              {supportsChoices(e.kind, e.supports).map((s) => <option key={s} value={s}>{supportsShort(s)}</option>)}
            </select></label>
          <label className="block"><span className={LABEL_CLASS}>Why</span>
            <textarea rows={2} className={INPUT_CLASS} value={reason} onChange={(ev) => setReason(ev.target.value)} />
            <p className={HELP_CLASS}>At least 12 characters. Kept with the withdrawn link and the new one.</p></label>
        </div>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ supports, reason: reason.trim() })}
        submitLabel="Withdraw and correct" onSuccess={() => { setOpen(false); setSupports(''); setReason(''); onDone(); }} renderSuccess={() => <>Corrected.</>} />
    </div>
  );
}

/**
 * Q4l: a second (or later) run, once the latest is locked — e.g. after an
 * AI-sourced citation is opened, so the new run seals the opened state.
 * The same route as W7's first run; nothing earlier changes.
 */
function NewRun({ engId, next, banner, onDone }: { engId: string; next: number; banner: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ banner_title: banner, note: '', source_fixture: '' });
  if (!open) {
    return (
      <div className="mt-1">
        <button type="button" onClick={() => setOpen(true)}
          className={'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' + FOCUS_RING}>
          Produce a new run…
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="new-run">
      <GovernedForm<{ value_run_id: string }>
        path={`/api/engagements/${engId}/produce-run`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">Run {next}: the outcome, its evidence and its confidence as they stand now, snapshotted. Earlier runs keep what they sealed. Not locked until you lock it.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Banner</span>
            <input className={INPUT_CLASS} value={v.banner_title} onChange={(e) => setV({ ...v, banner_title: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Note (required)</span>
            <input className={INPUT_CLASS} value={v.note} placeholder="What changed since the last run, e.g. the citation was opened" onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Run source label (required)</span>
            <input className={INPUT_CLASS} value={v.source_fixture} onChange={(e) => setV({ ...v, source_fixture: e.target.value })} /></label>
        </div>}
        canSubmit={v.banner_title.trim() !== '' && v.note.trim() !== '' && v.source_fixture.trim() !== ''}
        unmet={[...(v.banner_title.trim() === '' ? ['a banner'] : []), ...(v.note.trim() === '' ? ['a note'] : []), ...(v.source_fixture.trim() === '' ? ['a run source label'] : [])]}
        buildBody={() => v}
        submitLabel={`Produce run ${next}`}
        onSuccess={() => { setOpen(false); setV({ ...v, note: '' }); onDone(); }}
        renderSuccess={() => <>Produced.</>} />
    </div>
  );
}

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

export type { WalkStatus };

export function OutsideInWalk({ institutionId, onChanged, onStatus, targets, primaryFor }: {
  institutionId: string; onChanged: () => void;
  /** UX-1: called with what the walk knows, each time it loads. */
  onStatus?: (s: WalkStatus) => void;
  /** UX-1: W7–W8 render into the "Run and lock" step, W9 into "Account detail". */
  targets?: { run?: Element | null; retire?: Element | null };
  /** UX-1: the W-steps that may carry the screen's one filled button (the open workspace step's). */
  primaryFor?: string[];
}) {
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
  const [pa, setPa] = useState({ person_id: '', title: 'External analyst of record — not an employee. Asserting from published material.' });
  const [p2, setP2] = useState({ offering_key: '', capability_name: '', owner_person_id: '', basis: '' });
  const [p3, setP3] = useState({ capability_id: '', industry_measure_id: '', claim: '' });
  const [p4, setP4] = useState({ engagement_name: '', owner: '', metric_name: '', unit: '', direction: '', source_system: '', capability_name: '', baseline_value: '', baseline_measured_at: '' });
  const [p5, setP5] = useState({ industry_measure_id: '', basis_note: '' });
  const [p7, setP7] = useState({ banner_title: 'OUTSIDE-IN HYPOTHESIS', note: '', source_fixture: '' });
  const [p8, setP8] = useState({ lock_reason: '' });
  const [p9, setP9] = useState({ retirement_reason: '' });
  useEffect(() => { if (w && !('error' in w)) onStatus?.(walkStatus(w)); }, [w]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!w) return <Card n="W" title="Outside-in walk"><p className="m-0 text-ink-45">loading</p></Card>;
  if ('error' in w) return <Card n="W" title="Outside-in walk"><p className="m-0 text-critical">{w.error}</p></Card>;

  const { claims, eng, outcome, lockedRun, openRun, s1, s2, s3, s4, s5, s6, s7, s8, s9 } = deriveWalk(w);
  const pr = (sid: string, st: StepState) => Boolean(primaryFor?.includes(sid)) && st === 'next';
  const stewardReason = actor?.is_steward ? undefined : `Retiring an engagement is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone (3.0 Band A).`;

  // Who may own a capability or an engagement here: the analyst of record
  // (linked staff) and the account's own people.
  const owners = [
    ...w.analysts.map((a) => ({ id: a.id, label: `${a.full_name} — analyst of record` })),
    ...w.persons.map((p) => ({ id: p.id, label: p.full_name })),
  ];
  const analystId = pa.person_id || actor?.id || '';
  const chosen = w.pack.find((m) => m.id === p3.industry_measure_id);
  const claimedForBasis = claims.filter((c) => outcome && c.capability_name === outcome.capability_name);

  return (
    <Card n="W" title="Outside-in walk" badge={<Badge tone="neutral">{w.institution.industry_name ?? 'Unclassified'}</Badge>}>
      <p className="m-0 mb-2 max-w-[85ch] text-[12.5px] text-ink-45">
        A hypothesis from published material, step by step. Each step is an existing governed write; nothing is prefilled from
        a source. A hypothesis with no target is complete: never derive a target from a vendor claim.
      </p>
      <div data-testid="outside-in-walk">
        <Step id="W1" title="Analyst of record" state={s1} testId="w1">
          {w.analysts.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink" data-testid="w1-analysts">{w.analysts.map((a) => `${a.full_name} — ${a.title}`).join('; ')}</p>}
          {w.persons.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{w.persons.map((p) => `${p.full_name}${p.title ? ` — ${p.title}` : ''}`).join('; ')}</p>}
          {s1 === 'next' && (
            <div data-testid="w1-name-existing">
            <GovernedForm<{ account_person_link_id: string }>
              path={`/api/institutions/${institutionId}/analyst-of-record`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">An existing person — the tenant's own analyst, usually you — named analyst of record on this account, with the title for this account. <strong>No new person is created</strong>, and this does not make them the customer's: they can own what they assert, never commit to a target or verify an actual.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Person', <select className={INPUT_CLASS} value={analystId} onChange={(e) => setPa({ ...pa, person_id: e.target.value })}>
                  {w.staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.id === actor?.id ? ' (you)' : ''}</option>)}</select>)}
                {field('Title on this account', <input className={INPUT_CLASS} value={pa.title} onChange={(e) => setPa({ ...pa, title: e.target.value })} />, undefined, true)}
              </div>}
              canSubmit={!!analystId && pa.title.trim().length >= 3}
              buildBody={() => ({ person_id: analystId, title: pa.title })}
              primary={pr('w1', s1)} submitLabel="Name the analyst of record" onSuccess={reload} renderSuccess={() => <>Named.</>} />
            </div>
          )}
          {s1 === 'next' && (
            <div className="mt-3 border-t border-rule-soft pt-2" data-testid="w1-add-person">
            <p className="m-0 mb-1 text-[11.5px] text-ink-45">Or add a person of this account (the customer's own people only; someone already in LVRF is named above, not added again).</p>
            <GovernedForm<{ person_ids: string[] }>
              path={`/api/institutions/${institutionId}/inputs`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">A person of this account (customer-side).</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Full name', <input className={INPUT_CLASS} value={p1.full_name} onChange={(e) => setP1({ ...p1, full_name: e.target.value })} />)}
                {field('Email (required by the route)', <input className={INPUT_CLASS} value={p1.email} onChange={(e) => setP1({ ...p1, email: e.target.value })} />)}
                {field('Title', <input className={INPUT_CLASS} value={p1.title} onChange={(e) => setP1({ ...p1, title: e.target.value })} />, 'their title at the account, e.g. "EHS director"', true)}
              </div>}
              canSubmit={p1.full_name.trim() !== '' && p1.email.trim() !== ''}
              buildBody={() => ({ persons: [{ full_name: p1.full_name, email: p1.email, title: p1.title || null }] })}
              submitLabel="Add the person" onSuccess={reload} renderSuccess={() => <>Added.</>} />
            </div>
          )}
        </Step>

        <Step id="W2" title="Offering and capability" state={s2} waitsFor="W1, an analyst of record or a person to own the capability" testId="w2">
          {w.capabilities.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink">{w.capabilities.map((c) => c.name).join('; ')}</p>}
          {s2 === 'next' && (
            <GovernedForm<{ capability_id: string }>
              path={`/api/institutions/${institutionId}/offerings`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">An offering attached to this account, and the capability it builds. The basis says why; state the solution (e.g. "EHS solution").</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Offering', <select className={INPUT_CLASS} value={p2.offering_key} onChange={(e) => setP2({ ...p2, offering_key: e.target.value })}>
                  <option value="">— choose —</option>{w.offerings.map((o) => <option key={o.offering_key} value={o.offering_key}>{o.name}</option>)}</select>)}
                {field('Owner', <select className={INPUT_CLASS} value={p2.owner_person_id} onChange={(e) => setP2({ ...p2, owner_person_id: e.target.value })}>
                  <option value="">— choose —</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>)}
                {field('Capability name', <input className={INPUT_CLASS} value={p2.capability_name} onChange={(e) => setP2({ ...p2, capability_name: e.target.value })} />, undefined, true)}
                {field('Basis', <textarea rows={2} className={INPUT_CLASS} value={p2.basis} onChange={(e) => setP2({ ...p2, basis: e.target.value })} />, undefined, true)}
              </div>}
              canSubmit={!!p2.offering_key && !!p2.owner_person_id && p2.capability_name.trim() !== '' && p2.basis.trim().length >= 12}
              buildBody={() => ({ offering_key: p2.offering_key, capability_name: p2.capability_name, owner_person_id: p2.owner_person_id, is_primary: false, basis: p2.basis })}
              primary={pr('w2', s2)} submitLabel="Attach" onSuccess={reload} renderSuccess={() => <>Attached.</>} />
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
              primary={pr('w3', s3)} submitLabel="Record the claim" onSuccess={reload} renderSuccess={() => <>Claimed.</>} />
          )}
        </Step>

        <Step id="W4" title="The value outcome, with its published baseline" state={s4} waitsFor="W3, a claim" testId="w4">
          {outcome && (
            <p className="m-0 mb-2 text-[12.5px] text-ink">
              {eng!.name}: {outcome.metric.name}, baseline <strong>{Number(outcome.baseline_value)}</strong> {outcome.metric.unit} at {outcome.baseline_measured_at.slice(0, 10)} ·
              target {outcome.target_value === null ? 'none (a hypothesis)' : Number(outcome.target_value)} · {outcome.realization}, {outcome.confidence}
            </p>
          )}
          {/* P1: a figure check that flagged, or a statement backing a figure, beside the figures. */}
          {outcome?.evidence.map((e) => <FigureCheckLine key={e.id} check={e.figure_check} of={e.supports === 'impact_basis' ? 'impact basis' : e.supports} className="mb-1" />)}
          {s4 === 'next' && (
            <GovernedForm<{ value_outcome_id: string }>
              path={`/api/institutions/${institutionId}/value-outcomes`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">The engagement, its metric, and the baseline as published. <strong>No target is offered:</strong> a hypothesis with no target is complete, and a target derived from a vendor claim would invent its terms. Zero is a value.</p>}
              fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {field('Engagement name', <input className={INPUT_CLASS} value={p4.engagement_name} onChange={(e) => setP4({ ...p4, engagement_name: e.target.value })} />, 'e.g. "<Account> — reference example, not an engagement"', true)}
                {field('Owner', <select className={INPUT_CLASS} value={p4.owner} onChange={(e) => setP4({ ...p4, owner: e.target.value })}>
                  <option value="">— choose —</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>)}
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
              primary={pr('w4', s4)} submitLabel="Record the outcome" onSuccess={reload} renderSuccess={() => <>Recorded.</>} />
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
              primary={pr('w5', s5)} submitLabel="Set the basis" onSuccess={reload} renderSuccess={() => <>Set.</>} />
          )}
        </Step>

        <Step id="W6" title="Evidence: the baseline, and any vendor claim" state={s6} waitsFor="W5, the pack basis" testId="w6">
          {outcome && outcome.evidence.length > 0 && (
            <ul className="m-0 mb-2 list-none p-0">{outcome.evidence.map((e) => <li key={e.id} className="py-0.5 text-[12px] text-ink" data-testid="w6-evidence">{e.kind} · supports {supportsShort(e.supports)}{e.basis ? ` · basis ${e.basis.replace(/_/g, ' ')}` : ''} — <span className="text-ink-45">{e.summary}</span><EvidenceRestsOn e={e} statedBy={e.stated_by} statedOn={e.stated_on} /><OpenCitation e={e} onOpened={reload} />{e.corrects_supports && <span className="ml-1 text-[11px] text-ink-45" data-testid="w6-corrected"> · corrected from {e.corrects_supports.replace('_', ' ')}: {e.correction_reason}</span>}<CorrectSupport e={e} outcomeId={outcome.id} onDone={reload} /></li>)}</ul>
          )}
          {outcome && outcome.withdrawn_links.length > 0 && (
            <ul className="m-0 mb-2 list-none p-0">{outcome.withdrawn_links.map((l) => <li key={`${l.evidence_id}-${l.supports}`} className="py-0.5 text-[12px] text-ink-45" data-testid="w6-withdrawn"><s>supports {supportsShort(l.supports)} — {l.summary}</s> · withdrawn by {l.withdrawn_by}, {l.withdrawn_on}: {l.reason}</li>)}</ul>
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
              <AddEvidenceCard key={`ev-${outcome.evidence.length}`} n="W6" outcomeId={outcome.id} onRecorded={reload} primary={pr('w6', s6)} />
            </>
          )}
        </Step>

        {place(targets?.run, <>
        <Step id="W7" title="Produce the run" state={s7} waitsFor="W6, the baseline's evidence" testId="w7">
          {eng && eng.runs.length > 0 && (
            <ul className="m-0 mb-2 list-none p-0" data-testid="w7-runs">
              {eng.runs.map((r) => (
                <li key={r.id} className="py-1 text-[12.5px] text-ink" data-testid="w7-run" data-locked={r.locked_at ? 'true' : 'false'}>
                  <Link to={`/runs/${r.id}`} className={'font-semibold text-gold-ink ' + FOCUS_RING}>Run {r.run_number}</Link>
                  {' '}· {r.locked_at ? `locked ${r.locked_at.slice(0, 10)}` : 'not locked'} · confidence {r.confidence_band}{r.confidence_score !== null ? ` ${r.confidence_score}` : ''}
                  <ul className="m-0 list-none pl-3 text-[11.5px] text-ink-45">
                    {r.sealed_evidence.length === 0 && <li>sealed no evidence</li>}
                    {r.sealed_evidence.map((e, i) => (
                      <li key={i} data-testid="w7-sealed">
                        sealed: {supportsShort(e.supports)} · {e.kind} · basis {e.basis ?? '—'}
                        {e.ai_sourced ? ` · AI-sourced, citation ${e.citation_resolved ? 'opened' : 'not opened'}` : ''}
                        {' · '}{e.source_verified ? 'source verified' : 'unverified'} — {e.summary}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {eng && openRun && lockedRun && (
            <p className="m-0 mb-1 border-l-2 border-healthy pl-2 text-[12.5px] text-ink" role="status" data-testid="new-run-notice">
              Run {openRun.run_number} produced, not locked yet: lock it in W8.
            </p>
          )}
          {eng && !eng.retired && eng.runs.length > 0 && !openRun && <NewRun engId={eng.id} next={eng.runs.length + 1} banner={p7.banner_title} onDone={reload} />}
          {eng && eng.retired && eng.runs.length > 0 && <p className="m-0 text-[11.5px] text-ink-45">The engagement is retired: no new run.</p>}
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
              primary={pr('w7', s7)} submitLabel="Produce" onSuccess={reload} renderSuccess={() => <>Produced.</>} />
          )}
        </Step>

        <Step id="W8" title="Lock the run" state={s8} waitsFor="W7, a run" testId="w8">
          {lockedRun && <p className="m-0 mb-2 text-[12.5px] text-ink">Run {lockedRun.run_number} locked {lockedRun.locked_at!.slice(0, 10)}. A locked run cannot change.</p>}
          {openRun && (s8 === 'next' || (lockedRun && !eng?.retired)) && (
            <GovernedForm<{ run_id: string }>
              path={`/api/value-runs/${openRun.id}/lock`} provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">Locking run {openRun.run_number} is final: the run cannot change. Earlier locked runs stay as they were.</p>}
              fields={field('Lock reason', <textarea rows={2} className={INPUT_CLASS} value={p8.lock_reason} onChange={(e) => setP8({ lock_reason: e.target.value })} />)}
              canSubmit={p8.lock_reason.trim() !== ''}
              unmet={['say why the run is locked']}
              buildBody={() => ({ lock_reason: p8.lock_reason })}
              primary={Boolean(primaryFor?.includes('w8'))} submitLabel={`Lock run ${openRun.run_number}`} onSuccess={() => { setP8({ lock_reason: '' }); reload(); }} renderSuccess={() => <>Locked.</>} />
          )}
        </Step>

        </>)}

        {place(targets?.retire, <>
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
        </>)}
      </div>
    </Card>
  );
}
