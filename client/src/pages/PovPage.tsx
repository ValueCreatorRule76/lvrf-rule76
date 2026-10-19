import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchPov, recorded, type Pov, type PovHypothesis, type PovOutcome } from '../api/pov';
import { fetchGaps, type GapEntry } from '../api/gaps';
import { Badge } from '../components/workbench/Card';
import { FOCUS_RING } from '../components/GovernedForm';
import { HypothesisItem, SummaryItem } from '../components/PovAuthoring';

/**
 * O2 — the account POV (/accounts/:id/pov): the document a value engineer
 * puts in front of a reader (LVRF_PLAN §5, output 1). READ-ONLY: it is
 * authored on the account page. Every figure comes from a row, beside its
 * basis; every derived value (basis, verdict, falsifier sentence, banners)
 * is the server's. Layout follows the canvas "LVRF Outputs — mock-ups";
 * its departures (M1–M9, §5) are not built: tokens only, the seven spine
 * stages from the enum, the six-node chain, confidence only from a locked
 * run, no unrecorded series, no lens panels (O3).
 *
 * The banners cannot be suppressed: OUTSIDE-IN HYPOTHESIS when no figure on
 * the page has customer-side evidence; UNVERIFIED (rule 6) unless every
 * outcome is verified; REFERENCE EXAMPLE when the steward's marker says so
 * (O2-D2, O-D3).
 */

const H2 = 'm-0 font-display text-[24px] tracking-[.02em] text-ink';
const KICKER = 'text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const BASIS_TONE: Record<string, 'healthy' | 'neutral' | 'watch' | 'warning'> = {
  system_of_record: 'healthy', client_stated: 'healthy', published: 'neutral', inferred: 'watch', assumed: 'warning',
};

function BasisBadge({ basis }: { basis: string | null }) {
  return <Badge tone={basis ? BASIS_TONE[basis] ?? 'neutral' : 'neutral'}>{basis ? basis.replace(/_/g, ' ') : 'no basis'}</Badge>;
}

function Banners({ pov }: { pov: Pov }) {
  return (
    <div data-testid="banners">
      {pov.reference_example && (
        <div className="bg-ink px-6 py-2 font-mono text-[12px] tracking-[.04em] text-gold" data-testid="banner-reference">
          REFERENCE EXAMPLE, NOT AN ENGAGEMENT — {pov.reference_example.source_citation}
        </div>
      )}
      {pov.banners.outside_in && (
        <div className="bg-ink px-6 py-2 font-mono text-[12px] tracking-[.04em] text-offwhite" data-testid="banner-outside-in">
          OUTSIDE-IN HYPOTHESIS — no figure on this page has customer-side evidence behind it
        </div>
      )}
      {pov.banners.unverified && (
        <div className="border-b border-warning bg-white px-6 py-2 font-mono text-[12px] tracking-[.04em] text-warning" data-testid="banner-unverified">
          UNVERIFIED — {pov.outcomes.length === 0 ? 'no outcome is recorded' : 'not every outcome on this page has a verified actual'}
        </div>
      )}
    </div>
  );
}

/** One row per engagement: the seven value-spine stages, in the enum's order, reached as far as the engagement or any of its current outcomes. */
function StageBars({ pov }: { pov: Pov }) {
  if (pov.engagements.length === 0) return <p className="m-0 text-[12.5px] text-ink-45" data-testid="stage-none">No engagement yet: no stage reached.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="stages">
      {pov.engagements.map((e) => {
        const at = pov.value_spine.indexOf(e.value_stage);
        return (
          <nav key={e.id} aria-label={`Value spine progress: ${e.name}`}>
            <span className="text-[11.5px] text-ink-45">{e.name}{e.retired ? ' (retired)' : ''} · the furthest stage of the engagement and its outcomes</span>
            <ol className="m-0 mt-1 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-7">
              {pov.value_spine.map((stage, i) => {
                // A stage before the one reached is 'passed', never ticked: the
                // record does not confirm it — except commit, which it does
                // (a named committer), so an uncommitted commit is a gap.
                const state = i === at ? 'current' : i > at ? 'not reached'
                  : stage === 'commit' && !e.committed ? 'gap' : 'passed';
                return (
                  <li key={stage} className="flex flex-col gap-1" data-stage={stage} data-state={state}>
                    <span className={'h-1.5 ' + (state === 'passed' ? 'bg-ink-45' : state === 'current' ? 'bg-gold' : state === 'gap' ? 'bg-warning' : 'bg-rule')} aria-hidden="true" />
                    <span className={'text-[11.5px] ' + (state === 'not reached' ? 'text-ink-45' : state === 'gap' ? 'text-warning' : 'text-ink')}>
                      {stage}{state === 'current' ? ' · reached' : state === 'gap' ? ' · no committed target' : ''}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        );
      })}
    </div>
  );
}

function Confidence({ pov }: { pov: Pov }) {
  const runs = pov.engagements.filter((e) => e.latest_locked_run);
  return (
    <div className="min-w-[220px] border border-ink bg-white px-4 py-3" data-testid="confidence">
      <span className={KICKER}>Computed confidence</span>
      {runs.length === 0
        ? <p className="m-0 mt-1 text-[13px] text-ink">No computed confidence: no locked run.</p>
        : runs.map((e) => (
          <p key={e.id} className="m-0 mt-1 text-[13px] text-ink">
            <span className="font-display text-[22px]">{e.latest_locked_run!.confidence_band ?? '—'} {e.latest_locked_run!.confidence_score ?? ''}</span>
            <span className="block text-[11px] text-ink-45">
              run {e.latest_locked_run!.run_number}, locked {e.latest_locked_run!.locked_at.slice(0, 10)} ·{' '}
              <Link to={`/runs/${e.latest_locked_run!.id}`} className={'text-gold-ink hover:text-ink ' + FOCUS_RING}>open the run</Link>
            </span>
          </p>
        ))}
    </div>
  );
}

/** offering → capability → lever → pack entry → account metric → outcome; a missing node is a gap. */
function Chain({ h, o }: { h: PovHypothesis; o: PovOutcome | undefined }) {
  const cells: { label: string; value: string | null; detail?: string }[] = [
    { label: 'Offering', value: o && o.offerings.length > 0 ? o.offerings.map((x) => x.name).join(', ') : null, detail: o?.offerings.length ? undefined : 'no offering attached' },
    { label: 'Capability', value: o?.capability_name ?? null },
    { label: 'Lever', value: h.lever.name, detail: h.lever.withdrawn ? 'withdrawn since' : h.lever.status },
    { label: 'Pack entry', value: h.pack_entry.name, detail: h.direction_label },
    { label: 'Account metric', value: o?.metric_name ?? null },
    { label: 'Outcome', value: o ? (o.actual_value !== null ? `actual ${recorded(o.actual_value)}` : `baseline ${recorded(o.baseline_value)}`) : null,
      detail: o ? (o.source_verified ? `verified by ${o.verified_by}` : o.actual_value !== null ? 'actual not verified' : 'no actual yet') : undefined },
  ];
  return (
    <ol className="m-0 grid list-none grid-cols-1 border border-ink bg-white p-0 sm:grid-cols-6" data-testid="chain">
      {cells.map((c, i) => (
        <li key={c.label} className={'flex flex-col gap-1 px-3 py-3 ' + (i < cells.length - 1 ? 'border-b border-rule sm:border-b-0 sm:border-r ' : '') + (c.value === null ? 'bg-offwhite' : '')}
          data-gap={c.value === null ? 'true' : 'false'}>
          <span className={KICKER}>{i + 1} · {c.label}</span>
          <span className={'text-[14px] font-semibold ' + (c.value === null ? 'text-warning' : 'text-ink')}>{c.value ?? 'Gap'}</span>
          {c.detail && <span className="text-[11.5px] text-ink-45">{c.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

function OutcomeDetail({ o }: { o: PovOutcome }) {
  const vendorClaims = o.evidence.filter((e) => e.kind === 'vendor_publication');
  const other = o.evidence.filter((e) => e.kind !== 'vendor_publication');
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="outcome">
      <div className="border border-rule bg-white px-4 py-3">
        <span className={KICKER}>{o.metric_name}</span>
        <table className="mt-1 w-full border-collapse text-[13px]">
          <tbody>
            <tr><td className="py-1 text-ink-45">Baseline</td><td className="py-1 font-mono">{recorded(o.baseline_value)}{o.unit ? ` ${o.unit}` : ''}</td><td className="py-1 text-ink-45">recorded {o.baseline_measured_on}</td></tr>
            <tr><td className="py-1 text-ink-45">Target</td>{o.target_value !== null && o.committed_by
              ? <><td className="py-1 font-mono">{recorded(o.target_value)}</td><td className="py-1 text-ink-45">committed by {o.committed_by}, {o.committed_on}</td></>
              : <td className="py-1" colSpan={2} data-testid="no-target">No target: a hypothesis.</td>}</tr>
            <tr><td className="py-1 text-ink-45">Actual</td>{o.actual_value !== null
              ? <><td className="py-1 font-mono">{recorded(o.actual_value)}</td><td className="py-1 text-ink-45">{o.actual_measured_on} · {o.source_verified ? `verified by ${o.verified_by}` : 'not verified'}</td></>
              : <td className="py-1 text-ink-45" colSpan={2}>Not measured yet.</td>}</tr>
          </tbody>
        </table>
        {other.length > 0 && (
          <ul className="m-0 mt-2 list-none p-0">
            {other.map((e, i) => <li key={i} className="py-0.5 text-[12px] text-ink"><BasisBadge basis={e.basis} /> {e.supports}: {e.summary} <span className="text-ink-45">— {e.provenance}</span></li>)}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {vendorClaims.map((e, i) => (
          <div key={i} className="border border-rule bg-white px-4 py-3" data-testid="vendor-claim">
            <span className={KICKER}>Vendor publication — a claim, not an actual</span>
            <p className="m-0 mt-1 text-[14px] font-semibold text-ink">{e.summary}</p>
            <p className="m-0 mt-1 text-[12px] text-ink-45">{e.provenance}. Never applied to this account's baseline, never a target.</p>
          </div>
        ))}
        {o.pack_entry && (
          <div className="border border-rule bg-white px-4 py-3">
            <span className={KICKER}>Confounders · what the lever does not address</span>
            <p className="m-0 mt-1 whitespace-pre-wrap text-[12.5px] text-ink">{o.pack_entry.confounders}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WhatItTakes({ outcomes }: { outcomes: PovOutcome[] }) {
  const [gaps, setGaps] = useState<Record<string, GapEntry[] | string>>({});
  useEffect(() => {
    for (const o of outcomes) {
      if (o.engagement_retired) continue;
      fetchGaps(o.id).then((r) => setGaps((g) => ({ ...g, [o.id]: r.status === 'ok' ? r.gaps : r.message })));
    }
  }, [outcomes]);
  if (outcomes.length === 0) return <p className="m-0 text-[12.5px] text-ink-45">No outcome recorded: the first ask is a baseline from a named source.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="what-it-takes">
      <p className="m-0 text-[11.5px] text-ink-45">The current view, from the gap register — not part of any locked record, and it never changes a score.</p>
      {outcomes.map((o) => {
        const g = gaps[o.id];
        return (
          <div key={o.id} className="border border-rule bg-white">
            <span className={'block border-b border-rule px-3 py-2 ' + KICKER}>{o.metric_name}</span>
            {o.engagement_retired
              ? <p className="m-0 px-3 py-2 text-[12px] text-ink-45" data-testid="frozen">Frozen: this engagement is retired, so its outcome has no open asks. Its locked runs and hypotheses stay on the record.</p>
              : g === undefined ? <p className="m-0 px-3 py-2 text-[12px] text-ink-45">loading</p>
              : typeof g === 'string' ? <p className="m-0 px-3 py-2 text-[12px] text-ink-45">{g}</p>
              : g.length === 0 ? <p className="m-0 px-3 py-2 text-[12px] text-ink-45">Nothing outstanding.</p>
              : <table className="w-full border-collapse text-[12.5px]">
                  <thead><tr className="text-left text-ink-45"><th className="px-3 py-1.5 font-semibold">Ask</th><th className="px-3 py-1.5 font-semibold">Kind</th><th className="px-3 py-1.5 font-semibold">State</th></tr></thead>
                  <tbody>{g.map((e) => (
                    <tr key={e.factor} className="border-t border-rule-soft align-top">
                      <td className="px-3 py-1.5 text-ink">{e.requirement}</td>
                      <td className="px-3 py-1.5 text-ink-45">{e.ask_type}</td>
                      <td className="px-3 py-1.5 text-ink-45">{e.state}, {e.path}</td>
                    </tr>))}</tbody>
                </table>}
          </div>
        );
      })}
    </div>
  );
}

export function PovPage() {
  const { id } = useParams<{ id: string }>();
  const { actor } = useActor();
  const [state, setState] = useState<{ pov?: Pov; message?: string } | null>(null);
  useEffect(() => {
    if (!id || !actor) return;
    fetchPov(id).then((r) => setState(r.status === 'ok' ? { pov: r.pov } : { message: r.message }));
  }, [id, actor]);
  if (!actor) return <p className="p-8 text-ink-45">Sign in to view this POV.</p>;
  if (!state) return <p className="p-8 text-ink-45">loading</p>;
  if (!state.pov) return <p className="p-8 text-critical">{state.message}</p>;
  const pov = state.pov;
  const current = pov.hypotheses.filter((h) => h.verdict !== 'withdrawn' && h.verdict !== 'superseded');
  const earlier = pov.hypotheses.filter((h) => !current.includes(h));
  const summaries = pov.executive_summaries.filter((s) => s.current);
  const outcomeOf = (h: PovHypothesis) => pov.outcomes.find((o) => o.id === h.value_outcome_id);
  return (
    <div className="min-h-screen bg-offwhite" data-testid="pov">
      <Banners pov={pov} />
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-16 pt-8 sm:px-[30px]">
        <header className="flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <span className={KICKER}>Point of view{pov.institution.industry_name ? ` · ${pov.institution.industry_name} pack` : ''}</span>
              <h1 className="m-0 font-display text-[44px] leading-[1] tracking-[.012em] text-ink">{pov.institution.name}</h1>
              {pov.entity
                ? <span className="font-mono text-[12.5px] text-ink-45">{pov.entity.legal_name} · {pov.entity.identifier_type.replace(/_/g, ' ')} {pov.entity.identifier} <BasisBadge basis={pov.entity.basis} /></span>
                : <span className="text-[12px] text-ink-45">No legal entity pinned.</span>}
            </div>
            <Confidence pov={pov} />
          </div>
          <StageBars pov={pov} />
          <Link to={`/accounts/${pov.institution.id}`} className={'self-start text-[11px] text-ink-45 hover:text-gold-ink ' + FOCUS_RING}>← the account page (where this is authored)</Link>
        </header>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2" aria-labelledby="es">
          <div className="flex flex-col gap-2">
            <h2 id="es" className={H2}>Executive summary</h2>
            {summaries.length === 0
              ? <p className="m-0 border border-dashed border-ink-45 bg-white px-4 py-3 text-[13px] text-ink-45" data-testid="no-summary">[No executive summary written yet — it is written by a named person, versioned. This page generates no prose.]</p>
              : <ul className="m-0 list-none border border-rule bg-white px-4 p-0">{summaries.map((s) => <SummaryItem key={s.id} s={s} />)}</ul>}
          </div>
          <div className="flex flex-col gap-2">
            <h2 className={H2}>Value hypothesis</h2>
            {current.length === 0
              ? <p className="m-0 border border-dashed border-ink-45 bg-white px-4 py-3 text-[13px] text-ink-45">[No hypothesis stated yet.]</p>
              : <ul className="m-0 list-none border border-rule bg-white px-4 p-0">{current.map((h) => <HypothesisItem key={h.id} h={h} />)}</ul>}
          </div>
        </section>

        {current.map((h) => (
          <section key={h.id} className="flex flex-col gap-3" aria-label={`Value chain: ${h.statement}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={H2}>Value chain</h2>
              <span className="text-[12px] text-ink-45">Offering to outcome. A missing step shows as a gap.</span>
            </div>
            <Chain h={h} o={outcomeOf(h)} />
            {outcomeOf(h) && <OutcomeDetail o={outcomeOf(h)!} />}
          </section>
        ))}

        <section className="flex flex-col gap-3" aria-labelledby="wit">
          <h2 id="wit" className={H2}>What it takes to raise confidence</h2>
          <WhatItTakes outcomes={pov.outcomes} />
        </section>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h2 className={H2}>Account facts</h2>
            {pov.facts.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">No facts recorded.</p> : (
              <table className="w-full border-collapse border border-rule bg-white text-[12.5px]" data-testid="facts">
                <tbody>{pov.facts.map((f) => (
                  <tr key={f.id} className="border-b border-rule-soft align-top">
                    <td className="px-3 py-1.5 text-ink-45">{f.kind.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-1.5 font-mono text-ink">{f.value_text ?? `${recorded(f.value_numeric)}${f.unit ? ` ${f.unit}` : ''}`}</td>
                    <td className="px-3 py-1.5"><BasisBadge basis={f.basis} />{f.citation_resolved && <span className="ml-1 text-[11px] text-ink-45">citation opened by {f.citation_resolved_by}</span>}<span className="block text-[11px] text-ink-45">as of {f.as_of}</span></td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h2 className={H2}>Locked runs</h2>
            {pov.engagements.every((e) => e.locked_runs.length === 0)
              ? <p className="m-0 border border-dashed border-ink-45 bg-white px-4 py-3 text-[13px] text-ink-45">No locked run yet. A locked run is never rewritten.</p>
              : <ul className="m-0 list-none border border-rule bg-white p-0" data-testid="locked-runs">{pov.engagements.flatMap((e) => e.locked_runs.map((r) => (
                  <li key={r.id} className="border-b border-rule-soft px-4 py-2 text-[12.5px] last:border-b-0" data-testid="locked-run">
                    <Link to={`/runs/${r.id}`} className={'text-ink hover:text-gold-ink ' + FOCUS_RING}>{e.name}{e.retired ? ' (retired)' : ''}, run {r.run_number}</Link>
                    <span className="text-ink-45"> · locked {r.locked_at.slice(0, 10)}</span>
                    <span className="block font-mono text-[10.5px] text-ink-45">{r.payload_hash}</span>
                  </li>)))}</ul>}
          </div>
        </section>

        {earlier.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={H2}>Earlier versions and withdrawn hypotheses</h2>
            <ul className="m-0 list-none border border-rule bg-white px-4 p-0">{earlier.map((h) => <HypothesisItem key={h.id} h={h} />)}</ul>
          </section>
        )}

        <footer className="flex flex-wrap justify-between gap-3 border-t border-ink pt-3 text-[11.5px] text-ink-45">
          <span>Basis order: system of record › published › client-stated › inferred › assumed</span>
          <span>Rendered {new Date().toISOString().slice(0, 10)} from the record as it stands</span>
        </footer>
      </div>
    </div>
  );
}
