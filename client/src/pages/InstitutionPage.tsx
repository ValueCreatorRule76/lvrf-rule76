import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import {
  fetchInstitutionView,
  type InstitutionBusinessMetric,
  type InstitutionGap,
  type InstitutionPackMeasure,
  type InstitutionView,
} from '../api/institution';
import { Card, Badge } from '../components/workbench/Card';
import { FOCUS_RING } from '../components/GovernedForm';
import { AccountFactsCard } from '../components/AccountFactsCard';
import { AccountResearch, type ResearchStatus } from '../components/AccountResearch';
import { OutsideInWalk, type WalkStatus } from '../components/OutsideInWalk';
import { PovAuthoring, type PovStatus } from '../components/PovAuthoring';
import { ConfidenceBadge, PrimaryLink, StepRail, WorkspaceStep, type StepStatus } from '../components/workbench/Workspace';
import { MARKER_KIND } from '../api/pov';

// Same statuses as IndustryPackPage.tsx's STATUS_TONE — not imported,
// because that constant is that file's own local table, not an exported
// convention (same "one duplicate is not a pattern yet" reasoning as
// institutionView.ts's resolveActorTenantId).
const STATUS_TONE: Record<string, 'healthy' | 'watch' | 'critical' | 'neutral'> = {
  proposed: 'neutral',
  draft: 'neutral',
  active: 'healthy',
  ratified: 'healthy',
  superseded: 'watch',
  retired: 'critical',
  archived: 'neutral',
  rejected: 'critical',
};

/**
 * THREE BADGE FAMILIES — now four, with BASIS — each answering a different
 * question, never blended into one vocabulary:
 *
 *   STATUS       what the pack claims about itself: PROPOSED | RATIFIED.
 *                Nothing is ratified today. Tone: STATUS_TONE above —
 *                untouched by this pass.
 *   CLAIMABILITY whether a learning offering can move it: CLAIMABLE |
 *                NOT ADDRESSABLE. Always rendered — CLAIMABLE is a fact,
 *                not the silent default when nothing else is shown.
 *   COVERAGE     whether THIS ACCOUNT measures a PACK measure: MEASURED |
 *                NOT MEASURED. Applies only where an institution's own
 *                measurement can be checked, i.e. PackSection here — the
 *                industry-level IndustryPackPage.tsx has no institution to
 *                check coverage against, and correctly carries no COVERAGE
 *                badge at all, not a NOT APPLICABLE one (there is no
 *                account in the frame for "not applicable" to apply to).
 *   BASIS        the reverse question, asked of an ACCOUNT METRIC instead
 *                of a pack measure: does this metric map to a pack
 *                measure? PACK BASIS | NO PACK BASIS | NOT APPLICABLE.
 *                Forcing this into COVERAGE would misstate Curia's own
 *                finding — an unmapped metric is not a pack measure the
 *                account failed to measure, it is a metric the account
 *                measures with no pack basis, the inverse direction of
 *                the same question. NOT APPLICABLE is the is_tenant_self
 *                case: there is no pack for a tenant's own metric (DRR) to
 *                belong to, and never will be (section 00's own claim) —
 *                that is a fact about the frame, not a deficiency, so it
 *                gets the same neutral tone as PACK BASIS, not the watch
 *                tone NO PACK BASIS uses for a customer account's genuine
 *                unmapped metric (Curia's case).
 *
 * TONES: CLAIMABLE / MEASURED / PACK BASIS are ordinary states, not scores
 * — neutral, not healthy. NOT ADDRESSABLE / NOT MEASURED / NO PACK BASIS
 * are absences a reader must notice, not failures — watch, not critical or
 * warning. NOT APPLICABLE is neutral: a fact about the frame, not a
 * warning about the account.
 */
function claimabilityBadge(addressable: boolean) {
  return (
    <Badge tone={addressable ? 'neutral' : 'watch'}>
      {addressable ? 'Claimable' : 'Not addressable'}
    </Badge>
  );
}

function coverageBadge(measured: boolean) {
  return (
    <Badge tone={measured ? 'neutral' : 'watch'}>{measured ? 'Measured' : 'Not measured'}</Badge>
  );
}

function basisBadge(industryMeasureId: string | null, isTenantSelf: boolean) {
  if (isTenantSelf) {
    return <Badge tone="neutral">Not applicable</Badge>;
  }
  return (
    <Badge tone={industryMeasureId ? 'neutral' : 'watch'}>
      {industryMeasureId ? 'Pack basis' : 'No pack basis'}
    </Badge>
  );
}

const CONFIDENCE_TONE: Record<string, 'healthy' | 'watch' | 'critical'> = {
  high: 'healthy',
  medium: 'watch',
  low: 'critical',
};

// THE PAIR OF FACTS THE WHOLE SCREEN EXISTS TO KEEP APART: what the
// customer said at intake, and what a person later judged it to be against
// the taxonomy. Rendered side by side, never merged into one line — see
// db/schema.ts's industry/industryId comment and institutionClassify.ts's
// header comment, both making the same argument in their own layer.
function ClassificationSection({ view }: { view: InstitutionView }) {
  const { institution } = view;

  return (
    <Card n="00" title="Intake vs. classification">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
            Stated at intake
          </span>
          <p className="m-0 mt-1.5 text-[14px] leading-snug text-ink">
            {institution.industry ?? <span className="text-ink-45">Nothing recorded at intake.</span>}
          </p>
        </div>

        <div>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
            Classified as
          </span>
          {institution.industry_id && institution.industry_name && institution.industry_slug ? (
            <p className="m-0 mt-1.5 text-[14px] leading-snug text-ink">
              <Link
                to={`/packs/${institution.industry_slug}`}
                className={'font-semibold text-ink hover:text-gold-ink ' + FOCUS_RING}
              >
                {institution.industry_name}
              </Link>
            </p>
          ) : institution.is_tenant_self ? (
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-ink-45">
              This is the tenant's own customer-zero account. It is not classified against a
              taxonomy built for the tenant's customers, and it never will be.
            </p>
          ) : (
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-ink-45">
              Unclassified. No pack can be looked up until someone classifies this account —
              that is an honest state, not an error.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// SERVES ONE PURPOSE ONLY: PackSection's per-measure COVERAGE badge
// (MEASURED vs NOT MEASURED), answered for EVERY pack measure, addressable
// or not. This is NOT the gap computation and must never be extended back
// into one — the gap (which account metrics have no pack basis, which
// addressable measures nothing measures) is computed exactly once, on the
// server, in institutionView.ts, and arrives here as view.gap. Recomputing
// that filtering client-side from raw pack/metrics arrays is the "two
// implementations of one rule" divergence heartbeatLedger.ts warns about —
// it drifts the moment either side changes without the other. This Set
// survives that cleanup only because the badge asks a DIFFERENT question
// than the gap does: the gap's addressable_unmeasured list is already
// filtered to addressable measures, so it cannot answer "is THIS
// (possibly non-addressable) measure covered?" for every row PackSection
// renders. If a future change makes the server return per-measure
// coverage too, replace this Set with that field and delete this comment
// along with it — do not let both live side by side "just in case."
function measuredIndustryMeasureIds(metrics: InstitutionBusinessMetric[]): Set<string> {
  return new Set(
    metrics
      .map((m) => m.industry_measure_id)
      .filter((id): id is string => id !== null),
  );
}

function PackSection({
  pack,
  measuredIds,
  isTenantSelf,
}: {
  pack: InstitutionPackMeasure[] | null;
  measuredIds: Set<string>;
  isTenantSelf: boolean;
}) {
  if (pack === null) {
    return (
      <Card n="02" title="What this industry says carries money">
        <p className="m-0 text-[12.5px] text-ink-45">
          {isTenantSelf
            ? // Not "yet" — an industry pack describes what carries money for
              // a CUSTOMER, and this account is the tenant itself. No amount
              // of time makes one apply; this must not contradict section
              // 00's "and it never will be."
              'No pack applies — an industry pack describes what carries money for a customer, and this is the tenant’s own account.'
            : 'No pack — this account is not classified against an industry yet.'}
        </p>
      </Card>
    );
  }

  return (
    <Card n="02" title="What this industry says carries money" badge={<Badge tone="neutral">{pack.length}</Badge>}>
      {pack.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">
          No measures have been proposed for this industry yet.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {pack.map((m) => {
            const isMeasuring = measuredIds.has(m.id);
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft py-2.5 last:border-b-0"
              >
                <div>
                  <span className="text-[13.5px] font-semibold text-ink">{m.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-ink-45">
                    {m.unit} · {m.direction}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
                  {claimabilityBadge(m.addressable)}
                  {coverageBadge(isMeasuring)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function MetricsSection({
  metrics,
  isTenantSelf,
}: {
  metrics: InstitutionBusinessMetric[];
  isTenantSelf: boolean;
}) {
  return (
    <Card n="03" title="What this account is actually measuring" badge={<Badge tone="neutral">{metrics.length}</Badge>}>
      {metrics.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No business metrics recorded for this account.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {metrics.map((m) => (
            <li
              key={m.name}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft py-2.5 last:border-b-0"
            >
              <div>
                <span className="text-[13.5px] font-semibold text-ink">{m.name}</span>
                <span className="ml-2 font-mono text-[11px] text-ink-45">
                  {m.unit} · {m.direction}
                </span>
                {/* Provenance, not a label — same muted, non-mono treatment
                    as EvidenceCard's Provenance column, so source_system
                    reads as subordinate to the metric name above it rather
                    than competing with it at body weight. */}
                <span className="block text-[11.5px] text-ink-45">{m.source_system}</span>
              </div>
              {basisBadge(m.industry_measure_id, isTenantSelf)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// THE POINT OF THE SCREEN. Two lists, rendered plainly, no interpretation
// attached — an account metric with NO PACK BASIS, and a pack measure that
// is CLAIMABLE but NOT MEASURED at this account. Curia is the case that
// motivated this: it measures "Time to full productivity,
// newly promoted manager," which appears in no pack the CDMO industry
// carries — the pack's own claim is that Lot Acceptance Rate is what
// carries money there. The mismatch is left to speak for itself.
//
// BOTH LISTS COME FROM view.gap, NOT RE-DERIVED HERE. institutionView.ts
// computes unmapped_metrics/addressable_unmeasured itself now, from the
// same industry_measure_id FK — this component used to filter `metrics`
// and `pack` again, client-side, which was a second implementation of the
// same rule the server already answers. Two implementations of one rule is
// exactly the divergence shape that let a metric and a pack measure
// sharing a name show up on both sides at once before metricPackBasis.ts
// existed to link them: nothing was WRONG with either filter, but keeping
// two meant either one could silently drift from the other. `pack` is
// still accepted here, but ONLY to tell "unclassified/no pack" apart from
// "classified, pack has nothing outstanding" for the right column's
// message — never to filter or compute a list.
function GapSection({ gap, pack }: { gap: InstitutionGap; pack: InstitutionPackMeasure[] | null }) {
  const { unmapped_metrics: unmapped, addressable_unmeasured: opportunities } = gap;

  return (
    <Card n="04" title="The gap">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
            No pack basis
          </span>
          {unmapped.length === 0 ? (
            <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">
              Every metric this account reports maps to a pack measure.
            </p>
          ) : (
            <ul className="m-0 mt-1.5 list-none p-0">
              {unmapped.map((m) => (
                <li key={m.id} className="border-b border-rule-soft py-1.5 last:border-b-0">
                  <span className="text-[13px] text-ink">{m.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
            Claimable, not measured
          </span>
          {pack === null ? (
            <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">No pack to compare against.</p>
          ) : opportunities.length === 0 ? (
            <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">
              Nothing claimable in this pack is currently not measured.
            </p>
          ) : (
            <ul className="m-0 mt-1.5 list-none p-0">
              {opportunities.map((m) => (
                <li key={m.id} className="border-b border-rule-soft py-1.5 last:border-b-0">
                  <span className="text-[13px] text-ink">{m.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// UX-1 slice 1 (DESIGN_SPEC §9, "UX-1 standards"): the account as ONE guided
// path of six steps. Presentation only: every governed form is the one it was,
// rendered once, by the component that owns it; parts of OutsideInWalk and
// PovAuthoring are placed into their step by portal. Step status is DERIVED
// from what those components already read (their onStatus callbacks): no new
// table, no new fetch, no second implementation of any rule.
// ---------------------------------------------------------------------------

const STEP_TITLES = ['Research', 'Outside-in walk', 'Hypothesis', 'Summary', 'Run and lock', 'Point of view'] as const;
// The walk's sub-steps in the reader's words (standard 6: no step codes on screen).
const WALK_NEXT: Record<string, string> = {
  w1: 'name the analyst of record', w2: 'attach the offering and its capability', w3: "record the capability's claim on a pack entry",
  w4: 'record the value outcome with its published baseline', w5: "set the metric's pack basis", w6: 'record evidence for the baseline',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "5 Sep 2026", in UTC (the record's dates), the same on every browser.
const day = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const unitText = (u: string) => u.replace(/[.\s]+$/, '');
const band = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

interface Derived { status: StepStatus; summary: string }

function deriveSteps(r: ResearchStatus | null, w: WalkStatus | null, p: PovStatus | null): Derived[] {
  const done: boolean[] = [];
  const summaries: string[] = [];
  // 1. Research: the entity pinned.
  done.push(Boolean(r?.entity));
  const lockedRun = w ? [...w.runs].reverse().find((x) => x.locked_at) : undefined;
  summaries.push(r?.entity ? `Entity pinned: ${r.entity.legal_name}`
    : lockedRun ? `The entity is not pinned yet. Run ${lockedRun.run_number} stays as sealed; research adds facts for the next run.`
    : 'No researched fact is accepted until the entity is pinned.');
  // 2. The walk, to the baseline's evidence.
  const walkDone = Boolean(w && (['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).every((k) => w.steps[k] === 'done'));
  done.push(walkDone);
  const nextWalk = w ? (['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).find((k) => w.steps[k] !== 'done') : undefined;
  summaries.push(w?.baseline && walkDone
    ? `${w.baseline.metric} baseline ${Number(w.baseline.value)} ${unitText(w.baseline.unit)}, recorded ${day(w.baseline.measured_at)} · ${w.evidence.opened_verified} of ${w.evidence.total} citations opened and verified`
    : nextWalk ? `Next: ${WALK_NEXT[nextWalk]}.` : '');
  // 3. A current hypothesis. Its real precondition (a lever) is said, not hidden (Q4l).
  const hyp = p?.hypotheses[p.hypotheses.length - 1];
  done.push(Boolean(p && p.hypotheses.length > 0));
  summaries.push(hyp ? `${hyp.verdict === 'open' ? 'Open' : band(hyp.verdict.replace(/_/g, ' '))} · due ${day(hyp.due)} · via "${hyp.lever}"`
    : p && p.basedOutcomes === 0 ? 'Waits for step 2: an outcome on a pack entry.'
    : p && p.leverless.length > 0 && p.leverless.length === p.basedOutcomes ? `Waits for a lever on the pack entry ${p.leverless.map((e) => `"${e}"`).join(' and ')}.`
    : 'State what the capability changes, and what would show it wrong.');
  // 4. A current summary.
  const sum = p?.summaries[p.summaries.length - 1];
  done.push(Boolean(p && p.summaries.length > 0));
  summaries.push(sum ? `Version ${sum.versions}, ${sum.lens} reader · ${sum.drafted_with_ai ? `drafted with AI (${sum.drafting_tool})` : 'not AI-drafted'} · ${sum.author}, ${day(sum.created_at)}`
    : 'Written by a named person; LVRF writes no prose.');
  // 5. A locked run, and none open.
  const locked = w ? [...w.runs].reverse().find((x) => x.locked_at) : undefined;
  const open = w ? w.runs.find((x) => !x.locked_at) : undefined;
  done.push(Boolean(w && (w.engagement?.retired || (locked && !open))));
  summaries.push(open ? `Run ${open.run_number} produced, not locked yet: lock it.`
    : locked ? `Run ${locked.run_number} locked ${day(locked.locked_at!)} · ${Number(locked.confidence_score)} / 100 · ${band(locked.confidence_band)}${w!.runs.length > 1 ? ` (${w!.runs.length} runs)` : ''}`
    : 'A run seals what is on record when it is produced.');
  // 6. The point of view: a view, never "done".
  done.push(false);
  summaries.push('Renders from the record at any time, marked unverified until it is.');
  const current = done.findIndex((d) => !d);
  return done.map((d, i) => ({ status: d ? 'done' : i === current ? 'now' : 'wait', summary: summaries[i] }));
}

function Workspace({ view, refresh }: { view: InstitutionView; refresh: () => void }) {
  const id = view.institution.id;
  const [research, setResearch] = useState<ResearchStatus | null>(null);
  const [walk, setWalk] = useState<WalkStatus | null>(null);
  const [pov, setPov] = useState<PovStatus | null>(null);
  // Portal targets: where each part of a component renders.
  const [hypEl, setHypEl] = useState<HTMLDivElement | null>(null);
  const [sumEl, setSumEl] = useState<HTMLDivElement | null>(null);
  const [runEl, setRunEl] = useState<HTMLDivElement | null>(null);
  const [markerEl, setMarkerEl] = useState<HTMLDivElement | null>(null);
  const [retireEl, setRetireEl] = useState<HTMLDivElement | null>(null);
  const steps = deriveSteps(research, walk, pov);
  const now = steps.findIndex((s) => s.status === 'now') + 1;
  const measuredIds = measuredIndustryMeasureIds(view.metrics);
  const locked = walk ? [...walk.runs].reverse().find((x) => x.locked_at) : undefined;
  const marker = pov?.marker ? MARKER_KIND[pov.marker.kind] : null;
  const step = (i: number, body: ReactNode) => (
    <WorkspaceStep key={i} n={i + 1} title={STEP_TITLES[i]} status={steps[i].status} summary={steps[i].summary} testId={`ws-step-${i + 1}`}>{body}</WorkspaceStep>
  );
  return (
    <>
    {/* A reference example says so at the top, as the POV's banner does (O-D3). */}
    {pov?.marker && (
      <div className="bg-ink px-4 py-2.5 font-mono text-[12.5px] tracking-[.02em] text-offwhite sm:px-6" data-testid="ws-marker-banner">
        <span className="text-gold">{MARKER_KIND[pov.marker.kind].banner.split(' — ')[0]}</span> — {MARKER_KIND[pov.marker.kind].banner.split(' — ').slice(1).join(' — ')} · Source: {pov.marker.source_citation}
      </div>
    )}
    <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-6 sm:px-6" data-testid="workspace">
      <div className="mb-1.5 text-[12.5px] text-ink-45"><Link to="/" className={'text-ink-45 no-underline hover:text-ink ' + FOCUS_RING}>Accounts</Link> › {view.institution.name}</div>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-display text-[34px] leading-none tracking-[.02em] sm:text-[44px]">{view.institution.name}</h1>
          <p className="m-0 mt-1.5 text-[12.5px] text-ink-45" data-testid="ws-subtitle">
            {view.institution.industry_name ? `${view.institution.industry_name} pack` : 'Not classified'}
            {marker ? ` · a reference example (${marker.label.toLowerCase()}), not a customer engagement` : ''}
          </p>
        </div>
        <div data-testid="ws-confidence">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-45">Computed confidence</span>
          {locked
            ? <><ConfidenceBadge score={locked.confidence_score} band={locked.confidence_band} /><span className="mt-1 block text-[12px] text-ink-45">from run {locked.run_number}, locked {day(locked.locked_at!)}</span></>
            : <ConfidenceBadge score={null} band={null} />}
        </div>
      </header>
      {walk?.engagement?.retired && (
        <p className="m-0 mt-4 border-l-[3px] border-healthy bg-white px-3 py-2 text-[13px] text-ink" data-testid="ws-retired">
          The engagement is retired: book confidence no longer counts it. Its runs and hypothesis stay on the record.
        </p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[200px_1fr]">
        <StepRail steps={steps.map((s, i) => ({ n: i + 1, title: STEP_TITLES[i], status: s.status }))} />
        <div>
          {step(0, <>
            {/* An open research step never reads as a fault in a locked run. */}
            {!research?.entity && locked && (
              <p className="m-0 mb-3 border-l-[3px] border-gold bg-white px-3 py-2 text-[13px] text-ink" data-testid="ws-research-locked-note">
                Run {locked.run_number} is locked and stands as sealed: research adds facts for the next run and never changes a locked one.
              </p>
            )}
            <AccountResearch institutionId={id} onFactsChanged={refresh} onStatus={setResearch} primary={now === 1} />
          </>)}
          {step(1, <OutsideInWalk institutionId={id} onChanged={refresh} onStatus={setWalk} targets={{ run: runEl, retire: retireEl }}
            primaryFor={now === 2 ? ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] : now === 5 ? ['w7', 'w8'] : []} />)}
          {step(2, <div ref={setHypEl} />)}
          {step(3, <div ref={setSumEl} />)}
          {step(4, <div ref={setRunEl} />)}
          {step(5, <div>
            <p className="m-0 mb-3 text-[13px] text-ink">It renders from the record as it stands, with its disclosure banners, and prints with each run's record hash.</p>
            <PrimaryLink href={`/accounts/${id}/pov`} primary={now === 6}>Open the point of view</PrimaryLink>
          </div>)}
          {/* Hidden authoring host: the cards render into steps 3, 4 and the detail below. */}
          <PovAuthoring institutionId={id} onStatus={setPov} targets={{ hypothesis: hypEl, summary: sumEl, marker: markerEl }}
            primary={now === 3 ? 'hypothesis' : now === 4 ? 'summary' : null} />
          <details className="mt-6 border border-rule bg-white" data-testid="account-detail">
            <summary className="cursor-pointer list-none px-[18px] py-3 text-[13px] font-semibold tracking-[.02em]">
              Account detail ▸ <span className="font-normal text-ink-45">facts · what the industry says carries money · what this account measures · the gap · engagements · reference marker · retire the engagement</span>
            </summary>
            <div className="px-4 pb-4 pt-2">
              <ClassificationSection view={view} />
              <AccountFactsCard n="01" institutionId={id} facts={view.facts} onRecorded={refresh} />
              <PackSection pack={view.pack} measuredIds={measuredIds} isTenantSelf={false} />
              <MetricsSection metrics={view.metrics} isTenantSelf={false} />
              <GapSection gap={view.gap} pack={view.pack} />
              <Card n="05" title="Engagements" badge={<Badge tone="neutral">{view.engagements.length}</Badge>}>
                {view.engagements.length === 0
                  ? <p className="m-0 text-[12.5px] text-ink-45">No engagements recorded for this account.</p>
                  : <ul className="m-0 list-none p-0">{view.engagements.map((e) => <li key={e.id} className="border-b border-rule-soft py-1.5 last:border-b-0"><span className="text-[13px] text-ink">{e.name}</span></li>)}</ul>}
              </Card>
              <div ref={setMarkerEl} />
              <div ref={setRetireEl} className="border border-rule bg-white px-4" />
            </div>
          </details>
        </div>
      </div>
    </div>
    </>
  );
}

export function InstitutionPage() {
  const { id } = useParams<{ id: string }>();
  const { actor } = useActor();
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchInstitutionView>> | null>(null);

  useEffect(() => {
    if (!id || !actor) return;
    let cancelled = false;
    setResult(null);
    fetchInstitutionView(id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [id, actor]);

  // Refetch WITHOUT clearing to the loading state — used after a fact is
  // recorded, so the page (and the open add-fact form) stays mounted while
  // the new row arrives. Stable identity: AccountFactsCard's OnMount runs
  // it in an effect keyed on it.
  const refresh = useCallback(() => {
    if (!id || !actor) return;
    fetchInstitutionView(id).then(setResult);
  }, [id, actor]);

  if (!actor) {
    return (
      <p className="p-8 text-ink-45">
        Sign in to view this account — the view is scoped to the signed-in person's own
        tenant, and there is no default to fall back to.
      </p>
    );
  }
  if (!result) return <p className="p-8 text-ink-45">loading</p>;

  if (result.status === 'not_found') {
    return <p className="p-8 text-ink-45">{result.message}</p>;
  }
  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  const { view } = result;
  // UX-1 slice 1: a customer account is worked as the six-step path. The
  // tenant's own account is not an account to work (no walk, no research,
  // no POV), so it keeps the plain record view below.
  if (!view.institution.is_tenant_self) return <Workspace view={view} refresh={refresh} />;
  const measuredIds = measuredIndustryMeasureIds(view.metrics);

  return (
    <div className="mx-auto max-w-5xl px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF · Account
        </span>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
            {view.institution.name}
          </h1>
          {/* Current state leads, history is secondary: the score is what a
              reader needs, the run count is provenance for it. A bordered
              Badge for both would read as two equal facts — the count is
              downgraded to plain muted text so the eye lands on the score
              first, not on how many attempts produced it. */}
          <div className="flex items-center gap-2.5 pb-1">
            {view.runs.latest_confidence_band ? (
              <Badge tone={CONFIDENCE_TONE[view.runs.latest_confidence_band] ?? 'neutral'}>
                {view.runs.latest_confidence_score} · {view.runs.latest_confidence_band}
              </Badge>
            ) : (
              <Badge tone="neutral">Not yet run</Badge>
            )}
            <span className="text-[10.5px] text-ink-45">
              {view.runs.count} {view.runs.count === 1 ? 'run' : 'runs'}
            </span>
          </div>
        </div>
        {/* As entered at creation; the CHECK guarantees http(s), so this
            cannot be a javascript: link. */}
        {view.institution.website && (
          <a
            href={view.institution.website}
            target="_blank"
            rel="noopener noreferrer"
            className={'text-[12px] text-ink-45 hover:text-gold-ink ' + FOCUS_RING}
          >
            {view.institution.website}
          </a>
        )}
      </header>

      <ClassificationSection view={view} />
      <AccountFactsCard
        n="01"
        institutionId={view.institution.id}
        facts={view.facts}
        onRecorded={refresh}
      />
      {/* Q4c2: the outside-in walk, below the facts (LVRF_PLAN §4c). */}
      {!view.institution.is_tenant_self && (
        <OutsideInWalk institutionId={view.institution.id} onChanged={refresh} />
      )}
      <PackSection
        pack={view.pack}
        measuredIds={measuredIds}
        isTenantSelf={view.institution.is_tenant_self}
      />
      <MetricsSection metrics={view.metrics} isTenantSelf={view.institution.is_tenant_self} />
      <GapSection gap={view.gap} pack={view.pack} />

      <Card n="05" title="Engagements" badge={<Badge tone="neutral">{view.engagements.length}</Badge>}>
        {view.engagements.length === 0 ? (
          <p className="m-0 text-[12.5px] text-ink-45">No engagements recorded for this account.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {view.engagements.map((e) => (
              <li key={e.id} className="border-b border-rule-soft py-1.5 last:border-b-0">
                <span className="text-[13px] text-ink">{e.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* O2: hypotheses, the executive summary and the reference-example
          marker; the POV page is the document they feed. */}
      {!view.institution.is_tenant_self && <PovAuthoring institutionId={view.institution.id} />}

      {/* Q4h: account research intake (3.0 item 6). Hidden for the tenant's own
          record, which is not an account to research. */}
      {!view.institution.is_tenant_self && (
        <AccountResearch institutionId={view.institution.id} onFactsChanged={refresh} />
      )}
    </div>
  );
}
