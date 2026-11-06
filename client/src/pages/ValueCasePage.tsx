import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { postGoverned } from '../api/post';
import { MARKER_KIND, type MarkerKind } from '../api/pov';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING } from '../components/GovernedForm';
import { ConfidenceCurve } from '../components/snapshots/ConfidenceCurve';
import { CaseInputs } from '../components/valueCase/CaseInputs';
import { num, money } from '../lib/caseFormat';

/**
 * B3 (P6; LVRF_PLAN §19) — /runs/:id/case: one run's value case, read from its sealed payload, through a lens.
 *
 * Built to be printed (M21; UX item 1): an executive page first (the hypothesis, the money at stake or the refusal,
 * cost of delay, and every ask the record derives with its converting question); every figure with its unit or
 * currency, one number format, and a source footnote in words; no short ids or lever codes in the print (the hash and
 * both banners stay); the CFO refusal framed as "What we need from you"; a short glossary; US Letter.
 *
 * Rule 6: the disclosure banner prints on every page and cannot be suppressed. Outside-in says so on every page. A
 * reference example says so, and never reads through the CFO lens (O-D3). Nothing on the page is computed here: the
 * figures are the seal's, and cost of delay is the database's (lvrf_cost_of_delay), sealed at produce.
 */
interface Source { kind: string; summary: string; provenance: string | null; source_reference: string | null; supports: string; basis: string | null;
  figure_check?: { result: string; detail: string } | null }
interface Ask { code: string; need: string; question: string }
interface Hypothesis {
  id: string; statement: string; verdict: string; author: string | null; stated_on: string; superseded_by: string | null; withdrawn: boolean;
  falsifier: { reference: string; value: string | null; recorded_on: string | null; due: string | null; conditions: string | null };
  falsifier_text: string | null;
  lever: { name: string; mechanism: string; leading_indicator: string; withdrawn: boolean } | null;
}
interface CostOfDelay {
  status: 'computed' | 'refused' | 'measured'; amount: string | null; months: string | null; currency: string | null; basis: string | null; note?: string;
  inputs?: { baseline: string | null; baseline_basis: string | null; target: string | null; committed_by: string | null; committed_on: string | null;
    rate: { rate: string; currency: string; per_unit: string; kind: string; basis: string | null; attested_by: string | null; attested_on: string | null } | null };
  reasons: { code: string; text: string }[];
}
interface Solution { hypothesis_id: string; lever: string; lever_current: boolean; offerings: { offering: string; basis: string; evidence_class: string | null }[] }
interface Milestone { id: string; title: string; due_on: string; owner: string | null; planned_by: string | null; stage: string | null; status: string; slipped: boolean }
interface Outcome {
  value_outcome_id: string | null; metric: string; unit: string | null; direction: string | null; baseline: number | null; target: number | null; actual: number | null;
  realization: string | null; claimed_currency_impact: number | null; currency: string | null; committer: string | null; verifier: string | null;
  committer_customer_side: boolean | null; committer_side_reason: string | null;
  sources: { baseline: Source | null; actual: Source | null; impact_basis: Source | null; target_commitment: Source | null }; floor: string | null;
  attribution: { method: string | null; class: string | null } | null; realized_currency_impact?: number | null;
}
interface Summary { lens: string; body: string; author: string; version: number; drafted_with_ai: boolean; drafting_tool: string | null; written_on: string }
interface ValueCase {
  run: { id: string; run_number: number; locked_at: string | null; locked_by: string | null; payload_hash: string; payload_version: number; score: number; band: string; system_exercise: unknown };
  engagement: { id: string; name: string; retired: boolean };
  account: { id: string; name: string; is_tenant_self: boolean };
  lens: 'cfo' | 'general'; banners: { outside_in: boolean; unverified: boolean; not_shown?: { summary: string; why: string }[] } | null; marker: { kind: MarkerKind } | null;
  case_sealed: boolean; v5: boolean; hypotheses: Hypothesis[]; summaries: Summary[];
  pack_entry: { name: string; status: string; version: number; sourced_at: number; threshold: number | null } | null;
  outcomes: Outcome[]; cost_of_delay: CostOfDelay | null; roadmap: { promised_measured_on: string | null; milestones: Milestone[] } | null;
  solutioning: Solution[] | null; asks: Ask[]; vendor_gaps: Ask[];
  cfo: { policy: { min: number; refusal_text: string; ratified_by: string; ratified_on: string; suppresses: string[] } | null; refused: boolean; reasons: Ask[]; reference_example: boolean } | null;
}

const withUnit = (v: number | string | null | undefined, unit: string | null) => {
  const n = num(v);
  return n === null ? null : unit ? `${n} ${unit}` : n;
};

/** A basis in words, for a footnote (never a code in the print). */
const BASIS_WORDS: Record<string, string> = {
  system_of_record: 'from the customer’s system of record',
  published: 'published',
  client_stated: 'stated by the customer and attested by a named person there',
  inferred: 'inferred, not stated by the customer',
  assumed: 'assumed: no source supports it yet',
};
const basisWords = (b: string | null | undefined) => (b ? BASIS_WORDS[b] ?? b.replace(/_/g, ' ') : 'with no source on record');

const VERDICT: Record<string, string> = { open: 'open', confirmed: 'confirmed', refuted: 'refuted', withdrawn: 'withdrawn' };
const STATUS_WORDS: Record<string, string> = { planned: 'planned', done: 'done', missed: 'missed' };

const GLOSSARY: [string, string][] = [
  ['Baseline', 'The metric’s value before the change, for the same population and period definition the target will use.'],
  ['Impact basis', 'What a claimed effect rests on. A vendor’s claim is shown as a vendor’s claim and is never applied to the baseline.'],
  ['Attested', 'Stated in writing by a named person at the customer, who is accountable for the figure.'],
  ['Proposed', 'A pack entry not yet sourced from enough customers’ systems of record to be ratified. No pack is certified yet.'],
];

/** Footnotes, numbered in order of first use on the page; made fresh on every render (a plain function, not a hook). */
function makeFootnotes() {
  const notes: string[] = [];
  const cite = (text: string) => {
    let i = notes.indexOf(text);
    if (i === -1) { notes.push(text); i = notes.length - 1; }
    return <sup className="ml-0.5 text-[9px] text-ink-45" data-testid="footnote-ref">{i + 1}</sup>;
  };
  return { notes, cite };
}

// B4 (stage-10 rehearsal, item 1): a figure check that flags the figure is said in the footnote, never hidden.
const sourceNote = (label: string, s: Source | null) =>
  s ? `${label}: ${basisWords(s.basis)}. ${s.summary}${s.provenance ? ` (${s.provenance})` : ''}.${s.figure_check?.result === 'flag' ? ` The quoted source does not state this figure (figure check: ${s.figure_check.detail}).` : ''}`
    : `${label}: no source is sealed with this run.`;
// B4 (item 2): the target's footnote, with its basis and whether the committer is customer-side as the record reads it.
const targetNote = (o: Outcome) => `Target: committed by ${o.committer ?? 'no one on record'}${o.committer_customer_side === true ? ', customer-side'
  : o.committer_customer_side === false ? `, whom the record does not find customer-side (${o.committer_side_reason ?? 'no reason recorded'})` : ''}.${o.sources.target_commitment
  ? ` Its record: ${basisWords(o.sources.target_commitment.basis)}. ${o.sources.target_commitment.summary}.` : ' No evidence of the commitment is sealed with this run.'}`;
/** B4 (design §3.2): what the case may say of a movement, by the method fixed at commit. Only control_group is causal. */
const ATTRIBUTION: Record<string, string> = {
  control_group: 'Attribution: a control group. A measured change may be called attributable to the learning, with the difference-in-differences shown.',
  comparison_group: 'Attribution: a comparison group, not randomised. A measured change is associated with the learning, never said to be caused by it.',
  trend_adjusted: 'Attribution: trend-adjusted. A measured change is reported only beyond the prior trend.',
  estimate_adjusted: 'Attribution: participant or manager estimates, adjusted. A measured change is an estimated contribution.',
  contribution_only: 'Attribution: none claimed. The outcome may move; no share of it is claimed for the learning.',
};
const attributionLine = (o: Outcome) => !o.attribution ? null
  : o.attribution.method ? ATTRIBUTION[o.attribution.method] ?? o.attribution.method
  : o.target !== null ? 'Attribution: not stated (committed before B4).' : null;

function Section({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return (
    <section className="mb-6 break-inside-avoid-page" data-testid={testid}>
      <h2 className="m-0 mb-2 border-b border-rule pb-1 font-display text-[18px] tracking-[.06em]">{title}</h2>
      {children}
    </section>
  );
}

function AskList({ asks, testid }: { asks: Ask[]; testid: string }) {
  if (asks.length === 0) return <p className="m-0 text-[12.5px] text-ink-70" data-testid={`${testid}-none`}>Nothing more is needed from you for this case as it stands.</p>;
  return (
    <ol className="m-0 list-decimal pl-5 text-[12.5px] text-ink" data-testid={testid}>
      {asks.map((a) => (
        <li key={a.code} className="mb-1.5" data-testid="ask" data-code={a.code}>
          <span className="font-semibold">{a.need}</span>
          <span className="block text-ink-70" data-testid="converting-question">Ask: {a.question}</span>
        </li>))}
    </ol>
  );
}

export function ValueCasePage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const lens = params.get('lens') === 'cfo' ? 'cfo' : 'general';
  const { actor } = useActor();
  const [d, setD] = useState<ValueCase | 'not_found' | 'error' | null>(null);
  const [curve, setCurve] = useState<Parameters<typeof ConfidenceCurve>[0]['points'] | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const load = useCallback(() => {
    setD(null);
    apiFetch(`/api/value-runs/${id}/case?lens=${lens}`).then(async (r) => {
      if (r.status === 404) { setD('not_found'); return; }
      if (!r.ok) { setD('error'); return; }
      const j = await r.json() as ValueCase;
      setD(j);
      const s = await apiFetch(`/api/engagements/${j.engagement.id}/snapshots`);
      if (s.ok) {
        const sj = await s.json() as { runs: { run_number: number; score: number; band: string; locked_at: string | null; model_fingerprint: string | null; model_version: string | null;
          value_outcome_id: string | null; errata: { recomputed_score: number | null }[]; system_exercise: unknown }[] };
        setCurve(sj.runs.filter((x) => x.locked_at !== null).map((x) => ({ run_number: x.run_number, score: x.score, band: x.band, locked_at: x.locked_at,
          model_fingerprint: x.model_fingerprint, model_version: x.model_version, value_outcome_id: x.value_outcome_id, erratum: x.errata.length > 0,
          recomputed: x.errata.find((e) => e.recomputed_score !== null)?.recomputed_score ?? null, system_exercise: x.system_exercise !== null })));
      }
    }, () => setD('error'));
  }, [id, lens]);
  useEffect(() => { load(); }, [load]);

  if (d === null) return <p className="p-8 text-ink-45">loading</p>;
  if (d === 'not_found') return <p className="p-8 text-ink-45" data-testid="case-not-found">This run was not found.</p>;
  if (d === 'error') return <p className="p-8 text-ink-70">Couldn&apos;t load this value case. Reload the page to try again.</p>;

  const { notes, cite } = makeFootnotes();
  const o = d.outcomes[0] ?? null;
  const metric = o?.metric ?? 'the metric';
  const cod = d.cost_of_delay;
  const hypotheses = d.hypotheses.filter((h) => !h.superseded_by && !h.withdrawn);
  const summary = [...d.summaries].filter((s) => s.lens === d.lens || s.lens === 'general').sort((a, b) => (a.lens === d.lens ? -1 : 1) - (b.lens === d.lens ? -1 : 1))[0] ?? null;
  const cfoRefused = d.lens === 'cfo' && Boolean(d.cfo?.refused);
  const printedOn = new Date().toISOString().slice(0, 10);

  const banners = (
    <div data-testid="banners" className="text-[10.5px] tracking-[.03em]">
      {d.marker && <div className="border-b border-rule px-1 py-1 font-mono text-ink-70" data-testid="banner-reference">{MARKER_KIND[d.marker.kind].banner}</div>}
      {d.banners?.outside_in && <div className="border-b border-rule px-1 py-1 font-mono text-ink-70" data-testid="banner-outside-in">OUTSIDE-IN HYPOTHESIS — no figure in this case has customer-side evidence behind it</div>}
      {d.banners?.unverified && <div className="border-b border-warning px-1 py-1 font-mono text-warning" data-testid="banner-unverified">UNVERIFIED — this case has no verified actual</div>}
    </div>
  );

  // The executive page's figures, each with its footnote in words.
  const baselineText = o ? withUnit(o.baseline, o.unit) : null;
  // A function, called where the line appears, so its footnote is numbered in reading order (Brad, 5 Nov 2026).
  const codLine = () => {
    if (!d.v5 || !cod) return <span data-testid="cod-not-sealed">Cost of delay: not sealed in this run.</span>;
    if (cod.status === 'measured') return <span data-testid="cod-measured">No cost of delay: the outcome is measured.</span>;
    if (cod.status === 'computed') {
      const r = cod.inputs?.rate;
      return <span data-testid="cod-computed">Cost of a {cod.months}-month delay: <strong>{money(cod.amount, cod.currency)}</strong>
        {cite(`Cost of delay: |${num(cod.inputs?.target)} − ${num(cod.inputs?.baseline)}| × ${money(r?.rate, r?.currency ?? null)} per ${r?.per_unit} per year × ${cod.months}/12, undiscounted; the rate ${basisWords(r?.basis)}, attested by ${r?.attested_by ?? 'no one'} on ${r?.attested_on ?? 'no date'}; the weaker basis of its inputs is ${basisWords(cod.basis)}. Projected at the committed target, not realized.`)}
        {' '}(projected at the committed target; not realized).</span>;
    }
    return <span data-testid="cod-refused">Cost of delay: not stated, because {cod.reasons.map((x) => x.text).join('; ')}.</span>;
  };

  async function print() {
    if (!d || typeof d === 'string') return;
    const r = await postGoverned<{ record_document_id: string }>(`/api/value-runs/${d.run.id}/print-request`, { lens: d.lens });
    if (r.status !== 'ok') { setPrintNote('The print request was not recorded, so the page was not printed.'); return; }
    setPrintNote(null);
    window.print();
  }

  return (
    <div className="min-h-screen bg-offwhite print:min-h-0 print:bg-white" data-testid="value-case" data-lens={d.lens}>
      <div className="print:hidden">{banners}</div>
      <table className="block w-full border-collapse print:table print:table-fixed">
        <thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell">{banners}</td></tr></thead>
        <tfoot className="hidden print:table-footer-group" data-testid="print-footer"><tr className="print:table-row"><td className="p-0 print:table-cell">
          <p className="m-0 pt-2 font-mono text-[8.5px] text-ink-45 [overflow-wrap:anywhere]">{d.account.name} · value case, run {d.run.run_number} · {d.lens === 'cfo' ? 'CFO lens' : 'general'} · record hash {d.run.payload_hash} · printed {printedOn}</p>
        </td></tr></tfoot>
        <tbody className="block print:table-row-group"><tr className="block print:table-row"><td className="block p-0 print:table-cell">
          <div className="mx-auto max-w-4xl px-4 pb-14 pt-6 font-body text-ink sm:px-[30px] print:max-w-none print:px-0 print:pt-3">
            <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" data-testid="case-controls">
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Lens</span>
              {(['general', 'cfo'] as const).map((l) => (
                <button key={l} type="button" onClick={() => setParams(l === 'cfo' ? { lens: 'cfo' } : {})} aria-pressed={d.lens === l}
                  className={'border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.1em] ' + (d.lens === l ? 'border-ink bg-ink text-offwhite' : 'border-silver text-ink-45 hover:border-ink hover:text-ink') + ' ' + FOCUS_RING}
                  data-testid={`lens-${l}`}>{l === 'cfo' ? 'CFO' : 'General'}</button>))}
              <button type="button" onClick={print} className={'ml-auto border border-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING} data-testid="print-case">Print</button>
              <Link to={`/runs/${d.run.id}`} className={'text-[11.5px] text-gold-ink underline ' + FOCUS_RING}>Run {d.run.run_number}</Link>
            </div>
            {printNote && <p className="mb-3 text-[12px] text-ink-70 print:hidden" data-testid="print-note">{printNote}</p>}

            {/* 1. The executive page. */}
            <section className="mb-8 break-after-page" data-testid="executive-page">
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Value case · {d.lens === 'cfo' ? 'CFO lens' : 'general'}</span>
              <h1 className="m-0 my-1.5 font-display text-[32px] leading-[1.02] tracking-[.012em]">{d.account.name}</h1>
              {(d.banners?.not_shown?.length ?? 0) > 0 && (
                <p className="m-0 mb-1 text-[12px] text-ink-70" data-testid="not-shown">{d.banners!.not_shown!.length === 1
                  ? `One customer-side item is on record but not shown: ${d.banners!.not_shown![0].summary}, ${d.banners!.not_shown![0].why}.`
                  : `${d.banners!.not_shown!.length} customer-side items are on record but not shown: ${d.banners!.not_shown!.map((x) => `${x.summary}, ${x.why}`).join('; ')}.`}</p>)}
              <p className="m-0 text-[12px] text-ink-45">{metric} · run {d.run.run_number}{d.run.locked_at ? `, locked ${d.run.locked_at.slice(0, 10)}${d.run.locked_by ? ` by ${d.run.locked_by}` : ''}` : ', not locked'} · computed confidence {d.run.score} / 100 ({d.run.band})</p>

              <h2 className="m-0 mb-1 mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-45">The hypothesis</h2>
              {hypotheses.length === 0
                ? <p className="m-0 text-[13px] text-ink-70" data-testid="exec-no-hypothesis">No hypothesis was sealed with this run.</p>
                : hypotheses.map((h) => <p key={h.id} className="m-0 mb-1 text-[14px] leading-snug" data-testid="exec-hypothesis">{h.statement}</p>)}

              <h2 className="m-0 mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-45">{cfoRefused ? 'Under the CFO lens' : 'The money at stake'}</h2>
              {cfoRefused
                ? <p className="m-0 text-[13px]" data-testid="exec-refused">This case is refused under the CFO lens, for {d.cfo!.reasons.length === 1 ? 'one reason' : `${d.cfo!.reasons.length} reasons`} set out under “What we need from you”, each with the question that clears it. What would meet it is below.</p>
                : <p className="m-0 text-[13px]" data-testid="exec-money">{codLine()}</p>}
              {o && <p className="m-0 mt-1 text-[12.5px] text-ink-70" data-testid="exec-baseline">Baseline {baselineText ?? 'not recorded'}{baselineText && cite(sourceNote('Baseline', o.sources.baseline))}; target {o.target !== null ? withUnit(o.target, o.unit) : 'not committed: a hypothesis'}{o.target !== null && cite(targetNote(o))}; actual {o.actual !== null ? withUnit(o.actual, o.unit) : 'not measured'}{o.actual !== null && cite(sourceNote('Actual', o.sources.actual))}.</p>}
              {cfoRefused && <p className="m-0 mt-1 text-[12.5px] text-ink-70">{codLine()}</p>}

              <h2 className="m-0 mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-45">What we need from you</h2>
              <AskList asks={d.asks} testid="exec-asks" />
            </section>

            {cfoRefused && d.cfo && (
              <Section title="What we need from you" testid="cfo-refusal">
                <p className="m-0 text-[13px]" data-testid="cfo-refusal-text">{d.cfo.policy ? d.cfo.policy.refusal_text : 'No CFO lens has been ratified yet, so the CFO lens refuses every case and says why.'}</p>
                {d.cfo.policy && <p className="m-0 mt-1 text-[11px] text-ink-45">The CFO lens: at least {d.cfo.policy.min} computed confidence, ratified by {d.cfo.policy.ratified_by} on {d.cfo.policy.ratified_on}.</p>}
                <h3 className="m-0 mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-ink-45">Why it is refused</h3>
                <AskList asks={d.cfo.reasons} testid="cfo-reasons" />
                <p className="m-0 mt-3 text-[12.5px] text-ink-70" data-testid="cfo-asks-pointer">What would meet it: the {d.asks.length} {d.asks.length === 1 ? 'ask' : 'asks'} on the first page, each with its question.</p>
              </Section>
            )}

            {!cfoRefused && <>
              <Section title="Executive summary" testid="case-summary">
                {summary
                  ? <><p className="m-0 whitespace-pre-line text-[13px] leading-relaxed">{summary.body}</p>
                      <p className="m-0 mt-1 text-[11px] text-ink-45" data-testid="summary-attribution">Written by {summary.author} on {summary.written_on}{summary.drafted_with_ai ? `, drafted with AI (${summary.drafting_tool})` : ''}; version {summary.version}.</p></>
                  : <p className="m-0 text-[12.5px] text-ink-45">No executive summary was sealed with this run.</p>}
              </Section>

              <Section title="Value hypotheses" testid="case-hypotheses">
                {hypotheses.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">None sealed.</p> : hypotheses.map((h) => (
                  <div key={h.id} className="mb-3" data-testid="case-hypothesis">
                    <p className="m-0 text-[13px] font-semibold">{h.statement}</p>
                    {h.lever && <p className="m-0 mt-0.5 text-[12px] text-ink-70">Through: {h.lever.name}{h.lever.withdrawn ? ' (this lever has since been withdrawn)' : ''}. {h.lever.mechanism} Watch first: {h.lever.leading_indicator}.</p>}
                    <p className="m-0 mt-0.5 text-[12px] text-ink-70" data-testid="falsifier">Shown wrong if: {h.falsifier_text ?? 'no falsifier was sealed'} Verdict as sealed: {VERDICT[h.verdict] ?? h.verdict}.</p>
                    <p className="m-0 mt-0.5 text-[11px] text-ink-45">Stated by {h.author ?? 'no one recorded'} on {h.stated_on}.</p>
                  </div>))}
              </Section>

              <Section title="Outcomes by lever" testid="case-outcomes">
                <table className="w-full border-collapse text-[12px]">
                  <thead><tr className="border-b border-rule text-left text-[10px] uppercase tracking-[.1em] text-ink-45">
                    <th className="py-1 pr-2 font-semibold">Metric</th><th className="py-1 pr-2 font-semibold">Baseline</th><th className="py-1 pr-2 font-semibold">Target</th>
                    <th className="py-1 pr-2 font-semibold">Actual</th><th className="py-1 font-semibold">Realization</th></tr></thead>
                  <tbody>{d.outcomes.map((x, i) => (
                    <tr key={x.value_outcome_id ?? i} className="border-b border-rule-soft align-top" data-testid="outcome-row" data-floor={x.floor ?? ''}>
                      <td className="py-1.5 pr-2">{x.metric}</td>
                      <td className="py-1.5 pr-2">{withUnit(x.baseline, x.unit) ?? 'not recorded'}{x.baseline !== null && cite(sourceNote('Baseline', x.sources.baseline))}</td>
                      <td className="py-1.5 pr-2">{x.target !== null ? <>{withUnit(x.target, x.unit)}{cite(targetNote(x))}</> : 'no target: a hypothesis'}</td>
                      <td className="py-1.5 pr-2">{x.actual !== null ? <>{withUnit(x.actual, x.unit)}{cite(sourceNote('Actual', x.sources.actual))}</> : 'not measured'}</td>
                      <td className="py-1.5">{x.realization ?? 'not sealed'}</td>
                    </tr>))}</tbody>
                </table>
                {/* D4 (Brad, 5 Nov 2026): a claimed impact prints only with an impact-basis source sealed; otherwise its refusal. */}
                {o?.claimed_currency_impact !== null && o?.claimed_currency_impact !== undefined && (o.sources.impact_basis
                  ? <p className="m-0 mt-2 text-[12px] text-ink-70" data-testid="vendor-claim">A vendor claim of {money(o.claimed_currency_impact, o.currency)} is on record{cite(sourceNote('Vendor claim', o.sources.impact_basis))}. It is shown as a claim and is never applied to the baseline.</p>
                  : <p className="m-0 mt-2 text-[12px] text-ink-70" data-testid="claim-refused">A claimed impact is recorded with no source behind it, so it is not shown.</p>)}
                {o && attributionLine(o) && <p className="m-0 mt-2 text-[12px] text-ink-70" data-testid="attribution">{attributionLine(o)}</p>}
                {/* B4 (design §3.2): a realized impact prints only under a control or comparison group, with an impact-basis source. */}
                {o?.realized_currency_impact !== null && o?.realized_currency_impact !== undefined && (
                  (o.attribution?.method === 'control_group' || o.attribution?.method === 'comparison_group') && o.sources.impact_basis
                    ? <p className="m-0 mt-2 text-[12px] text-ink" data-testid="realized">Realized: {money(o.realized_currency_impact, o.currency)}, {o.attribution.method === 'control_group' ? 'attributable to the learning' : 'associated with the learning'}{cite(sourceNote('Realized impact', o.sources.impact_basis))}.</p>
                    : <p className="m-0 mt-2 text-[12px] text-ink-70" data-testid="realized-withheld">A realized impact is recorded but not shown: {o.attribution?.method ? 'its attribution method claims no causal or comparative share' : 'no attribution method was stated at commit'}{o.sources.impact_basis ? '' : ', and no source supports it'}.</p>)}
                {d.pack_entry && (
                  <p className="m-0 mt-2 text-[12px] text-ink-70" data-testid="pack-entry-label">Pack entry: {d.pack_entry.name}, {d.pack_entry.status}, sourced at {d.pack_entry.sourced_at} of {d.pack_entry.threshold ?? 'an unset number of'} institutions{d.pack_entry.threshold === null ? ' (the pack ratification threshold is not set)' : ''}. No pack is certified yet.</p>)}
              </Section>

              <Section title="Cost of delay" testid="case-cod">
                <p className="m-0 text-[13px]">{codLine()}</p>
                {d.v5 && cod?.status === 'refused' && (
                  <ul className="m-0 mt-1 list-disc pl-5 text-[12px] text-ink-70" data-testid="cod-reasons">{cod.reasons.map((x) => {
                    const ask = [...d.asks, ...d.vendor_gaps].find((a) => a.code === x.code);
                    return <li key={x.code} data-code={x.code} className="mb-1">{x.text.charAt(0).toUpperCase() + x.text.slice(1)}.{ask && <span className="block text-ink-70" data-testid="cod-question">Ask: {ask.question}</span>}</li>;
                  })}</ul>)}
              </Section>

              <Section title="Roadmap: the plan to measure" testid="case-roadmap">
                {!d.v5 || !d.roadmap ? <p className="m-0 text-[12.5px] text-ink-45" data-testid="roadmap-not-sealed">The roadmap was not sealed in this run.</p> : <>
                  <p className="m-0 text-[12.5px]">Committed measurement date: {d.roadmap.promised_measured_on ?? 'none committed'}.</p>
                  {d.roadmap.milestones.length === 0 ? <p className="m-0 mt-1 text-[12.5px] text-ink-45" data-testid="roadmap-none">No milestones are on record.</p> : (
                    <ul className="m-0 mt-1 list-disc pl-5 text-[12.5px]" data-testid="roadmap-milestones">{d.roadmap.milestones.map((m) => (
                      <li key={m.id} data-testid="roadmap-milestone">{m.title}: due {m.due_on}, owner {m.owner ?? 'not recorded'} (as stated by {m.planned_by ?? 'the recorder'}){m.stage ? `, ${m.stage}` : ''}, {STATUS_WORDS[m.status] ?? m.status}{m.slipped ? ' (its date has moved; the earlier date stays on the record)' : ''}.</li>))}</ul>)}
                  {[...new Set(hypotheses.map((h) => h.falsifier.due).filter((x): x is string => Boolean(x)))].sort().map((due) => {
                    const n = hypotheses.filter((h) => h.falsifier.due === due).length;
                    return <p key={due} className="m-0 mt-1 text-[12px] text-ink-70" data-testid="roadmap-test-date">{n === 1 ? 'One hypothesis is' : `${n} hypotheses are`} tested by {due}.</p>;
                  })}
                </>}
              </Section>

              <Section title="Recommended solutioning" testid="case-solutioning">
                {!d.v5 || d.solutioning === null ? <p className="m-0 text-[12.5px] text-ink-45" data-testid="solutioning-not-sealed">Solutioning was not sealed in this run.</p>
                  : d.solutioning.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">No hypothesis, so no solution is recommended.</p>
                  : d.solutioning.map((s) => (
                    <div key={s.hypothesis_id} className="mb-2" data-testid="solutioning-lever" data-current={String(s.lever_current)}>
                      <p className="m-0 text-[12.5px] font-semibold">{s.lever}</p>
                      {!s.lever_current ? <p className="m-0 text-[12px] text-ink-45">This lever has been withdrawn, so nothing is recommended through it.</p>
                        : s.offerings.length === 0 ? <p className="m-0 text-[12px] text-ink-45" data-testid="solutioning-none">No offering is linked to this lever.</p>
                        : <ul className="m-0 list-disc pl-5 text-[12px]">{s.offerings.map((f) => <li key={f.offering} data-testid="solutioning-offering">{f.offering}: {f.basis}{f.evidence_class ? ` It can evidence: ${f.evidence_class.replace(/_/g, ' ')}.` : ''}</li>)}</ul>}
                    </div>))}
              </Section>

              <Section title="Confidence over time" testid="case-curve">
                {curve ? <ConfidenceCurve points={curve} /> : <p className="m-0 text-[12.5px] text-ink-45">loading</p>}
              </Section>
            </>}

            {d.vendor_gaps.length > 0 && (
              <Section title="Not yet set by the vendor" testid="vendor-gaps">
                <ul className="m-0 list-disc pl-5 text-[12px] text-ink-70">{d.vendor_gaps.map((g) => <li key={g.code}>{g.need}</li>)}</ul>
              </Section>)}

            {notes.length > 0 && (
              <Section title="Sources" testid="case-footnotes">
                <ol className="m-0 list-decimal pl-5 text-[11px] text-ink-70">{notes.map((n, i) => <li key={i} data-testid="footnote">{n}</li>)}</ol>
              </Section>)}

            <Section title="Glossary" testid="case-glossary">
              <dl className="m-0 text-[11.5px]">{GLOSSARY.map(([t, def]) => <div key={t} className="mb-1"><dt className="inline font-semibold">{t}: </dt><dd className="inline m-0 text-ink-70">{def}</dd></div>)}</dl>
            </Section>

            <div className="print:hidden"><CaseInputs vc={d} actorIsSteward={Boolean(actor?.is_steward)} stewardName={actor?.steward_name ?? null} actorName={actor?.full_name ?? null} onDone={load} /></div>
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );

}
