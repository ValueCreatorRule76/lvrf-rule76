import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { businessMetricName, isEnrichedBusinessMetric, type Run, type RunErratum } from '../../types/run';
import { MARKER_KIND, type Pov } from '../../api/pov';
import { day, unitText, STEP_TITLES } from '../../lib/workspaceStatus';
import { label, supportsShort, DISCLOSURE, REALIZATION, STAGE_LABEL } from '../../lib/labels';
import { GovernedAction } from '../GovernedAction';
import { FOCUS_RING, GovernedForm } from '../GovernedForm';
import { useActor } from '../../actor/ActorContext';
import { ConfidenceBadge } from './Workspace';
import { FigureCheckLine } from '../EvidenceRestsOn';
import { EvidenceCard } from './EvidenceCard';
import { AddEvidenceCard } from './AddEvidenceCard';
import { GapListCard } from './GapListCard';
import { HeartbeatCard } from './HeartbeatCard';
import { HealthCard } from './HealthCard';
import { FindingsCard } from './FindingsCard';
import { CompareCard, type EarlierRuns } from './CompareCard';
import { ConfidenceInstrument } from './ConfidenceInstrument';

/**
 * UX-1 slice 4: the run page (DESIGN_SPEC §9, LVRF_PLAN §7g; mock-up
 * design/mockups/run.html). Presentation only: everything shown is the run
 * row as stored (its payload sealed at walk time) or a read the app already
 * makes (the account's POV, for its reference marker and its engagements'
 * locked runs). It is a printed record too: the banners and the record hash
 * repeat on every printed page (CLAUDE.md, O-D5).
 */

/** The account read beside the run: its reference marker and its engagements' locked runs. */
export type AccountRead = { status: 'loading' } | { status: 'ok'; pov: Pov } | { status: 'error' } | { status: 'none' };

const KICKER = 'text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const H2 = 'm-0 font-display text-[24px] leading-none tracking-[.03em] text-ink';
const OUTLINED = 'border border-ink px-3 py-1.5 text-[12px] font-semibold tracking-[.02em] text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING;

/**
 * C1b (Brad, 25 Oct 2026): in the PRINTED header (`compact`) every line is bounded — one
 * line each, clipped — so Chrome repeats the header on every page. Unbounded text (the
 * marker's citation, an erratum's texts) prints in full once, on page 1 (PrintPageOne);
 * the header says so. On screen the banners are as before.
 */
const HEADER_LINE = 'print:overflow-hidden print:text-ellipsis print:whitespace-nowrap print:text-[10.5px] print:tracking-normal';

function RunBanners({ run, account, compact = false }: { run: Run; account: AccountRead; compact?: boolean }) {
  const p = run.payload;
  const verified = p.realization === 'verified';
  const marker = account.status === 'ok' ? account.pov.reference_example : null;
  const errata = (run.errata ?? []).filter((x) => x.superseded_by_id === null);
  const line = compact ? ' ' + HEADER_LINE : '';
  return (
    <div data-testid="banners">
      {marker && (
        <div className={'bg-ink px-4 py-2 font-mono text-[12px] tracking-[.04em] text-gold [overflow-wrap:anywhere] sm:px-6' + line} data-testid="banner-reference">
          {MARKER_KIND[marker.kind].banner} · {compact ? 'Source on page 1' : <>Source: {marker.source_citation}</>}
        </div>
      )}
      {account.status === 'error' && (
        <div className={'bg-ink px-4 py-2 font-mono text-[12px] tracking-[.04em] text-offwhite sm:px-6' + line} data-testid="banner-marker-unavailable">
          Couldn&apos;t load this account&apos;s reference marker: read the account page before relying on this run.
        </div>
      )}
      {p.bannerTitle && (
        <div className={'bg-ink px-4 py-2 font-mono text-[12px] tracking-[.04em] text-offwhite sm:px-6' + line} data-testid="banner-sealed">
          {p.bannerTitle} — as recorded at sealing
        </div>
      )}
      {verified
        ? <div className="border-b border-healthy bg-white px-4 py-2 font-mono text-[12px] tracking-[.04em] text-healthy sm:px-6" data-testid="banner-verified">
            VERIFIED — this run&apos;s outcome has an actual verified by a named person
          </div>
        : <div className="border-b border-warning bg-white px-4 py-2 font-mono text-[12px] tracking-[.04em] text-warning sm:px-6" data-testid="banner-unverified">
            UNVERIFIED — this run&apos;s outcome has no verified actual
          </div>}
      {/* C1 (LVRF_PLAN §9): an erratum, recorded after sealing, beneath the disclosure banner, on screen and on every
          printed page — in print as one bounded line (C1b), its full text once on page 1. */}
      {compact
        ? errata.length > 0 && (
            <div className={'border-b-2 border-ink bg-white px-4 py-2 font-mono text-[12px] tracking-[.02em] text-ink sm:px-6' + line} data-testid="banner-erratum-line">
              {errata.length === 1
                // The figures and the pointer first: if the line is clipped, only who and when are cut (Brad, 25 Oct 2026).
                ? <><span className="font-semibold">ERRATUM</span>: {errata[0].recomputed_score === null ? 'not recomputed' : <>recomputed {Number(errata[0].recomputed_score)} / 100</>} (sealed {Number(errata[0].sealed_score)} / 100). Full text on page 1. Recorded after sealing, {day(errata[0].recorded_at)}, by {errata[0].recorded_by}.</>
                : <><span className="font-semibold">{errata.length} ERRATA</span>. Full text on page 1. Recorded after sealing, the latest {day(errata[errata.length - 1].recorded_at)}.</>}
            </div>
          )
        : errata.map((x) => <ErratumBanner key={x.id} x={x} />)}
    </div>
  );
}

const band = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, '');

/** C1 (LVRF_PLAN §9): what the sealed run got wrong — beside it, never in it. */
function ErratumBanner({ x }: { x: RunErratum }) {
  return (
    <div className="border-b-2 border-ink bg-white px-4 py-2 font-mono text-[12px] tracking-[.02em] text-ink [overflow-wrap:anywhere] sm:px-6" data-testid="banner-erratum">
      <span className="font-semibold">ERRATUM</span> — recorded after sealing, {day(x.recorded_at)}, by {x.recorded_by}.
      {' '}What was wrong: {sentence(x.what_was_wrong)}. What is right: {sentence(x.what_is_right)}. Why: {sentence(x.reason)}.
      {x.supersedes_id && <>{' '}It supersedes the erratum recorded {x.supersedes_recorded_at ? day(x.supersedes_recorded_at) : ''} by {x.supersedes_recorded_by}, because: {sentence(x.supersession_reason ?? '')}.</>}
      {' '}<span className="font-semibold">The sealed record below is unchanged.</span>
      {x.recomputed_score === null || x.recomputed_band === null
        // C2 (Brad, 25 Oct 2026): the server could not reproduce the seal; its sentence says why. No score is shown but the sealed one.
        ? <>{' '}<span data-testid="erratum-not-recomputed">{x.recompute_method.replace(/\s*The sealed run is unchanged\.$/, '').replace(/\.$/, '')}</span> (sealed: {Number(x.sealed_score)} / 100 · {band(x.sealed_band)}).</>
        : <>{' '}Recomputed under model {x.model_version}, the one it was sealed with, with the correction: {Number(x.recomputed_score)} / 100 · {band(x.recomputed_band)} (sealed: {Number(x.sealed_score)} / 100 · {band(x.sealed_band)}).</>}
    </div>
  );
}

/** C1b: printed once, at the top of page 1 — the full texts the bounded header points to. */
function PrintPageOne({ run, account }: { run: Run; account: AccountRead }) {
  const marker = account.status === 'ok' ? account.pov.reference_example : null;
  const errata = (run.errata ?? []).filter((x) => x.superseded_by_id === null);
  if (!marker && errata.length === 0 && !run.payload.bannerTitle) return null;
  return (
    <div className="hidden print:block" data-testid="print-page-one">
      {marker && <p className="m-0 mb-1 font-mono text-[10.5px] text-ink [overflow-wrap:anywhere]" data-testid="print-marker-full">{MARKER_KIND[marker.kind].banner} · Source: {marker.source_citation}</p>}
      {run.payload.bannerTitle && <p className="m-0 mb-1 font-mono text-[10.5px] text-ink [overflow-wrap:anywhere]">{run.payload.bannerTitle} — as recorded at sealing</p>}
      {errata.map((x) => <ErratumBanner key={x.id} x={x} />)}
    </div>
  );
}

function Breadcrumb({ run }: { run: Run }) {
  const n = run.payload.runNumber;
  return (
    <nav aria-label="Breadcrumb" className="print:hidden" data-testid="breadcrumb">
      <ol className="m-0 flex list-none flex-wrap gap-x-1.5 p-0 text-[12px] text-ink-45">
        <li><Link to="/" className={'hover:text-gold-ink ' + FOCUS_RING}>Accounts</Link> ›</li>
        {run.institution_id && run.institution_name
          ? <>
              <li><Link to={`/accounts/${run.institution_id}`} className={'hover:text-gold-ink ' + FOCUS_RING}>{run.institution_name}</Link> ›</li>
              <li><Link to={`/accounts/${run.institution_id}`} className={'hover:text-gold-ink ' + FOCUS_RING}>{STEP_TITLES[4]}</Link> ›</li>
            </>
          : <li>its account is retired ›</li>}
        <li aria-current="page" className="text-ink">Run {n}</li>
      </ol>
    </nav>
  );
}

/** The run's stage, as sealed (terminal_value_stage), on the spine in plain words. */
function StageStrip({ run }: { run: Run }) {
  const spine = Object.keys(STAGE_LABEL);
  const at = spine.indexOf(run.terminal_value_stage);
  // A stage before the one reached is 'passed', never ticked — except commit,
  // which the record confirms only through a named committer of record.
  const committed = (run.payload.confidence.factors.find((f) => f.factor === 'human_commit_of_record')?.earned ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1.5" data-testid="run-stages">
      <span className="text-[11.5px] text-ink-45">The stage this run reached, as sealed</span>
      <ol className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-7" aria-label="Value spine">
        {spine.map((stage, i) => {
          const state = i === at ? 'current' : i > at ? 'not reached' : stage === 'commit' && !committed ? 'gap' : 'passed';
          return (
            <li key={stage} className="flex flex-col gap-1" data-stage={stage} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={'h-1.5 ' + (state === 'passed' ? 'bg-ink-45' : state === 'current' ? 'bg-gold' : state === 'gap' ? 'bg-warning' : 'bg-rule')} aria-hidden="true" />
              <span className={'text-[11.5px] ' + (state === 'not reached' ? 'text-ink-45' : state === 'gap' ? 'text-warning' : 'text-ink') + (state === 'current' ? ' font-semibold' : '')}>
                {label(STAGE_LABEL, stage)}{state === 'gap' ? ' · no committed target' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {/* UX-1 standard 7: every stage bar has a legend. */}
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-45" data-testid="stage-legend">
        <span><span className="mr-1.5 inline-block h-1.5 w-4 bg-ink-45 align-middle" aria-hidden="true" />Done</span>
        <span><span className="mr-1.5 inline-block h-1.5 w-4 bg-gold align-middle" aria-hidden="true" />Furthest reached</span>
        <span><span className="mr-1.5 inline-block h-1.5 w-4 bg-warning align-middle" aria-hidden="true" />Not confirmed (no committed target)</span>
        <span><span className="mr-1.5 inline-block h-1.5 w-4 bg-rule align-middle" aria-hidden="true" />Not reached</span>
      </p>
    </div>
  );
}

function Figures({ run }: { run: Run }) {
  const p = run.payload;
  const bm = p.businessMetric;
  // The stored unit, its trailing punctuation dropped; a percent sign sits against its number.
  const u = isEnrichedBusinessMetric(bm) && bm.unit ? unitText(bm.unit) : '';
  const unit = u === '%' ? '%' : u ? ` ${u}` : '';
  const d = p.delta;
  const rows: [string, ReactNode][] = [
    ['Baseline', <><span className="font-mono">{p.baselineValue}</span>{unit}</>],
    ['Target', p.targetValue === null ? 'Not set: no target has been committed.' : <><span className="font-mono">{p.targetValue}</span>{unit}</>],
    ['Actual', p.actualValue === null ? 'Not measured yet. It comes from the customer’s own system of record.' : <><span className="font-mono">{p.actualValue}</span>{unit}</>],
    ['Change', d.available
      ? <><span className="font-mono">{d.raw > 0 ? '+' : ''}{d.raw}</span>{unit}{d.pct_of_target !== null ? ` · ${d.pct_of_target}% of target` : ''}</>
      : 'Not measured yet: no change to report.'],
    ['Realization', label(REALIZATION, p.realization)],
    ['Who may see it', label(DISCLOSURE, p.disclosure)],
  ];
  if (isEnrichedBusinessMetric(bm) && bm.sourceSystem) rows.push(['Source', bm.sourceSystem]);
  // Currency figures are stored without a currency on the run, so none is assumed.
  if (p.claimedCurrencyImpact !== null) rows.push(['Currency impact claimed', `${p.claimedCurrencyImpact.toLocaleString('en-US')} (no currency recorded on this run)`]);
  if (p.realizedCurrencyImpact !== null) rows.push(['Currency impact realized', `${p.realizedCurrencyImpact.toLocaleString('en-US')} (no currency recorded on this run)`]);
  return (
    <section className="border border-rule bg-white px-4 py-4 sm:px-5" aria-labelledby="figures" data-testid="figures">
      <h2 id="figures" className={H2}>The figures</h2>
      <dl className="m-0 mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[170px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="pt-1.5 text-ink-45 sm:pt-1">{k}</dt>
            <dd className="m-0 pb-1.5 text-ink sm:pt-1" data-testid={`figure-${k.toLowerCase().replace(/[\s,]+/g, '-')}`} data-record={k === 'Source' ? '' : undefined}>{v}{k === 'Source' && <span className="ml-1 text-[11px] italic text-ink-45" data-testid="sealed-mark">(as recorded at sealing)</span>}</dd>
          </div>
        ))}
      </dl>
      {/* P1-D4: a sealed figure check that flagged, or a statement backing a figure (payloadVersion 2). */}
      {(p.evidence ?? []).map((e, i) => (
        <span key={i} data-record><FigureCheckLine check={e.figure_check} of={e.supports === 'impact_basis' ? 'impact basis' : e.supports} className="mt-1" /></span>
      ))}
      <p className="m-0 mt-3 border-t border-rule-soft pt-3 text-[12.5px] text-ink-70" data-testid="verify-state">
        {p.realization === 'verified'
          ? 'Verified by a named person. Attested evidence earns partial credit, so a record of this shape cannot exceed 80 without independent verification.'
          : 'Not verified: the record is not shared with the customer until a named person verifies the actual against its source.'}
      </p>
    </section>
  );
}

function Actions({ run }: { run: Run }) {
  const verified = run.payload.realization === 'verified';
  // Refused here for the same two reasons POST /api/value-runs/:id/record-document refuses.
  const recordReason = run.locked_at === null
    ? 'A record document is rendered only from a locked run.'
    : typeof run.payload.valueOutcomeId !== 'string'
      ? 'This run predates the link to its outcome, so it cannot produce a record document.'
      : undefined;
  return (
    <div className="flex flex-wrap items-start gap-4 print:hidden" data-testid="run-actions">
      <GovernedAction<{ record_document_id: string; document_version: number; content_hash: string }>
        label="Render record"
        path={`/api/value-runs/${run.id}/record-document`}
        actorRequiredNote="Sign in before writing."
        disabledReason={recordReason}
        renderSuccess={(data) => (
          <p className="m-0">
            Record document v{data.document_version} created. The row is the document of record; a rendered PDF is a rendering of it.
            <br />
            <span className="font-mono text-[11px] text-ink-45 [overflow-wrap:anywhere]">{data.content_hash}</span>
          </p>
        )}
      />
      <div className="flex flex-col gap-1">
        <button type="button" disabled={!verified} className="border border-silver px-3 py-1.5 text-[12px] font-semibold tracking-[.02em] text-ink-45 disabled:cursor-not-allowed enabled:border-ink enabled:text-ink">
          Share with customer
        </button>
        {!verified && <span className="max-w-[30ch] text-[11px] text-ink-45" data-testid="share-reason">Shared only once a named person verifies the outcome.</span>}
      </div>
    </div>
  );
}

/**
 * C1: the steward records an erratum on this sealed run, about a link since
 * corrected on its outcome. The recompute is the server's, under the model the
 * run was sealed with; nothing here types a score.
 */
function RecordErratum({ run, account, onChanged }: { run: Run; account: AccountRead; onChanged: () => void }) {
  const { actor } = useActor();
  const [open, setOpen] = useState(false);
  const [evidenceId, setEvidenceId] = useState('');
  const [wrong, setWrong] = useState('');
  const [right, setRight] = useState('');
  const [why, setWhy] = useState('');
  const [supersessionReason, setSupersessionReason] = useState('');
  if (run.locked_at === null) return null;
  const outcome = account.status === 'ok' ? account.pov.outcomes.find((o) => o.id === run.payload.valueOutcomeId) : undefined;
  const corrected = (outcome?.evidence ?? []).filter((e) => e.corrects_supports !== null);
  const notSteward = actor?.is_steward ? undefined : `Recording an erratum is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  const noCorrection = corrected.length === 0 ? 'No link on this run\'s outcome has been corrected since it was sealed: an erratum records one.' : undefined;
  const reason = notSteward ?? noCorrection;
  if (!open) {
    return (
      <div className="flex flex-col gap-1 print:hidden" data-testid="record-erratum">
        <button type="button" disabled={Boolean(reason)} onClick={() => setOpen(true)}
          className="self-start border border-ink px-3 py-1.5 text-[12px] font-semibold tracking-[.02em] text-ink hover:bg-ink hover:text-offwhite disabled:cursor-not-allowed disabled:border-silver disabled:text-ink-45 disabled:hover:bg-transparent" data-testid="record-erratum-open">
          Record an erratum…
        </button>
        {reason && <span className="max-w-[46ch] text-[11px] text-ink-45" data-testid="erratum-reason">{reason}</span>}
      </div>
    );
  }
  // C1 review: one erratum per run and correction; a later one supersedes the current one.
  const chosen = corrected.find((e) => e.evidence_id === evidenceId);
  const current = chosen ? (run.errata ?? []).find((x) => x.superseded_by_id === null && x.evidence_id === chosen.evidence_id && x.corrected_to_supports === chosen.supports) : undefined;
  const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
  const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
  const unmet = [
    ...(evidenceId === '' ? ['choose the corrected link'] : []),
    ...(wrong.trim().length < 12 ? ['say what was wrong, in at least 12 characters'] : []),
    ...(right.trim().length < 12 ? ['say what is right, in at least 12 characters'] : []),
    ...(why.trim().length < 12 ? ['say why, in at least 12 characters'] : []),
    ...(current && supersessionReason.trim().length < 12 ? ['say why the earlier erratum is superseded, in at least 12 characters'] : []),
  ];
  return (
    <div className="border-t border-rule-soft pt-3 print:hidden" data-testid="record-erratum">
      <GovernedForm<{ erratum_id: string; recomputed_score: number | null; recomputed_band: string | null }>
        path={`/api/value-runs/${run.id}/errata`}
        provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">An erratum beside this sealed run, by you, dated. <strong>The sealed run is not changed.</strong> The server recomputes its confidence with the correction, under the model it was sealed with, and states both scores; if the seal cannot be reproduced, it records that it was not recomputed, and why.</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={L}>The corrected link</span>
            <select className={I} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}>
              <option value="" disabled>— choose —</option>
              {corrected.map((e) => <option key={e.evidence_id} value={e.evidence_id}>{e.summary.slice(0, 80)} — now supports {supportsShort(e.supports)}, not {supportsShort(e.corrects_supports ?? '')}</option>)}
            </select></label>
          <label className="block"><span className={L}>What was wrong</span><textarea rows={2} className={I} value={wrong} onChange={(e) => setWrong(e.target.value)} /></label>
          <label className="block"><span className={L}>What is right</span><textarea rows={2} className={I} value={right} onChange={(e) => setRight(e.target.value)} /></label>
          <label className="block"><span className={L}>Why it is recorded</span><textarea rows={2} className={I} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          {current && <>
            <p className="m-0 text-[12px] text-ink" data-testid="erratum-supersedes">An erratum for this correction is already recorded ({day(current.recorded_at)}, by {current.recorded_by}). This one <strong>supersedes</strong> it; the earlier one stays on the record.</p>
            <label className="block"><span className={L}>Why the earlier erratum is superseded</span><textarea rows={2} className={I} value={supersessionReason} onChange={(e) => setSupersessionReason(e.target.value)} /></label>
          </>}
        </div>}
        canSubmit={unmet.length === 0}
        unmet={unmet}
        buildBody={() => ({ evidence_id: evidenceId, what_was_wrong: wrong.trim(), what_is_right: right.trim(), reason: why.trim(),
          ...(current ? { supersedes_erratum_id: current.id, supersession_reason: supersessionReason.trim() } : {}) })}
        submitLabel="Record the erratum"
        onSuccess={() => { setOpen(false); setSupersessionReason(''); onChanged(); }}
        renderSuccess={(d) => <>{d.recomputed_score === null ? 'Recorded, not recomputed: the erratum says why.' : <>Recorded. Recomputed: {Number(d.recomputed_score)} / 100.</>}</>}
      />
    </div>
  );
}

function AddEvidence({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  if (run.engagement_retired) {
    return <p className="m-0 text-[12.5px] text-ink-70" data-testid="run-frozen">Locked, and its engagement retired: no evidence is added to this run.</p>;
  }
  if (typeof run.payload.valueOutcomeId !== 'string') {
    return <p className="m-0 text-[12.5px] text-ink-70" data-testid="run-no-outcome">This run predates the link to its outcome, so evidence is not added through it: add it on the account page.</p>;
  }
  return (
    <div className="flex flex-col gap-2 print:hidden" data-testid="add-evidence">
      <div className="flex flex-wrap items-baseline gap-3">
        <button type="button" aria-expanded={open} aria-controls="add-evidence-form" onClick={() => setOpen((o) => !o)} className={OUTLINED} data-testid="add-evidence-open">
          {open ? 'Close the evidence form' : 'Add evidence…'}
        </button>
        <span className="text-[11.5px] text-ink-45">Evidence goes on the outcome, never on this run: a locked run does not change, and the next run seals it.</span>
      </div>
      <div id="add-evidence-form" className={open ? '' : 'hidden'} inert={!open}>
        {open && <AddEvidenceCard run={run} n="" />}
      </div>
    </div>
  );
}

/** A folded section: one line on screen, opened on demand; always printed in full. */
function Fold({ title, testid, children }: { title: string; testid: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = `${testid}-body`;
  return (
    <section className="border border-rule bg-white print:border-0" data-testid={testid}>
      <h2 className="m-0 hidden font-display text-[20px] tracking-[.03em] text-ink print:block">{title}</h2>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={'w-full px-4 py-3 text-left text-[13px] font-semibold text-ink print:hidden ' + FOCUS_RING} data-testid={`${testid}-toggle`}>
        {title} {open ? '▾' : '▸'}
      </button>
      <div id={id} className={'border-t border-rule px-4 pb-1 pt-4 print:border-0 print:px-0 ' + (open ? '' : 'hidden print:block')} inert={!open}>
        {children}
      </div>
    </section>
  );
}

function earlierRunsFor(run: Run, account: AccountRead): EarlierRuns | undefined {
  // A retired engagement's own run list is refused (404) by its route; its
  // locked runs come with the account's POV, so the comparison still works.
  if (!run.engagement_retired) return undefined;
  if (account.status !== 'ok') return account.status === 'loading' ? 'loading' : 'unavailable';
  const e = account.pov.engagements.find((x) => x.id === run.engagement_id);
  return e ? e.locked_runs.map((r) => ({ id: r.id, run_number: r.run_number, locked_at: r.locked_at })) : 'unavailable';
}

/** Every printed page: this run's record hash (or that nothing is sealed), the print date and the rendering. */
function PrintFooter({ run }: { run: Run }) {
  return (
    <div className="mt-3 border-t border-ink pt-1.5 text-[9px] leading-snug text-ink-70">
      {run.locked_at
        ? <p className="m-0 [overflow-wrap:anywhere]" data-testid="print-sealed">{run.payload.engagement}{run.engagement_retired ? ' (retired)' : ''}: run {run.payload.runNumber}, locked {day(run.locked_at)} · record hash <span className="font-mono">{run.payload_hash}</span></p>
        : <p className="m-0" data-testid="print-unsealed">Not locked: nothing on this page is sealed.</p>}
      <p className="m-0">Printed {day(new Date().toISOString())} · rendered from the record as it stands</p>
    </div>
  );
}

export function Workbench({ run, account, onChanged }: { run: Run; account: AccountRead; onChanged: () => void }) {
  const p = run.payload;
  const bm = p.businessMetric;
  const direction = isEnrichedBusinessMetric(bm) ? `, ${bm.direction === 'decrease' ? 'lower' : 'higher'} is better` : '';
  return (
    // PRINT: as on the POV, a real <table> in print only: the banners are its
    // <thead> and the record line its <tfoot>, which Chrome repeats on every
    // printed page. On screen they are plain blocks.
    <div className="min-h-screen bg-offwhite print:min-h-0 print:bg-white" data-testid="run-page">
      <div className="print:hidden"><RunBanners run={run} account={account} /></div>
      <table className="block w-full border-collapse print:table print:table-fixed">
        <thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell"><RunBanners run={run} account={account} compact /></td></tr></thead>
        <tfoot className="hidden print:table-footer-group" data-testid="print-footer"><tr className="print:table-row"><td className="p-0 print:table-cell"><PrintFooter run={run} /></td></tr></tfoot>
        <tbody className="block print:table-row-group"><tr className="block print:table-row"><td className="block p-0 print:table-cell">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-[30px] print:gap-5 print:px-0 print:pb-4 print:pt-4">
            <PrintPageOne run={run} account={account} />
            <header className="flex flex-col gap-4">
              <Breadcrumb run={run} />
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={KICKER}>Realization record · run {p.runNumber} · {run.locked_at ? `locked ${day(run.locked_at)}` : 'not locked'}</span>
                  <h1 className="m-0 font-display text-[44px] leading-[1] tracking-[.012em] text-ink">Run {p.runNumber}</h1>
                  <p className="m-0 text-[13px] text-ink-70" data-testid="run-subject">
                    {p.engagement}{run.engagement_retired ? ' (retired)' : ''} · {p.capability} · {businessMetricName(bm)}{direction}
                  </p>
                </div>
                <div className="min-w-[220px] border border-ink bg-white px-4 py-3" data-testid="confidence">
                  <span className={KICKER}>Computed confidence</span>
                  <p className="m-0 mt-1"><ConfidenceBadge score={p.confidence.score} band={p.confidence.band} /></p>
                </div>
              </div>
              {p.note && (
                <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-70" data-testid="run-note">
                  <span className={KICKER} data-testid="sealed-mark">{p.bannerTitle ?? 'Note'}, as recorded at sealing </span> <span data-record>{p.note}</span>
                </p>
              )}
              <StageStrip run={run} />
              <p className="m-0 text-[11.5px] text-ink-45" data-testid="run-hash">
                Record hash <span className="font-mono text-ink-70 [overflow-wrap:anywhere]">{run.payload_hash}</span>
                {' · '}{run.locked_at ? 'a locked run never changes' : 'not locked: this run can still be replaced'}
              </p>
              <Actions run={run} />
              <RecordErratum run={run} account={account} onChanged={onChanged} />
            </header>

            <Figures run={run} />

            <section className="flex flex-col gap-3" aria-labelledby="sealed">
              <h2 id="sealed" className={H2}>What this run sealed</h2>
              <EvidenceCard run={run} />
              <AddEvidence run={run} />
            </section>

            <Fold title="What it takes to raise confidence" testid="fold-gaps">
              {run.engagement_retired
                ? <p className="m-0 mb-3 border-l-[3px] border-gold py-1 pl-3 text-[12.5px] text-ink" data-testid="frozen">Frozen: this engagement is retired, so its outcome has no open asks. Its locked runs and hypotheses stay on the record.</p>
                : <GapListCard run={run} />}
            </Fold>

            <Fold title="How the score was made, findings, heartbeat ledger, health, and the comparison with the previous run" testid="fold-ledgers">
              <ConfidenceInstrument run={run} />
              <FindingsCard run={run} />
              <HeartbeatCard run={run} />
              <HealthCard run={run} />
              <CompareCard run={run} earlier={earlierRunsFor(run, account)} />
            </Fold>
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
