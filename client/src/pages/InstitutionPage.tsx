import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import {
  fetchInstitutionView,
  type InstitutionBusinessMetric,
  type InstitutionPackMeasure,
  type InstitutionView,
} from '../api/institution';
import { Card, Badge } from '../components/workbench/Card';
import { FOCUS_RING } from '../components/GovernedForm';

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

// Which pack measure ids the account already reports against — a plain
// Set, computed once, so both this card and the gap section below read the
// same membership test instead of each re-deriving it.
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
      <Card n="01" title="What this industry says carries money">
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
    <Card n="01" title="What this industry says carries money" badge={<Badge tone="neutral">{pack.length}</Badge>}>
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
    <Card n="02" title="What this account is actually measuring" badge={<Badge tone="neutral">{metrics.length}</Badge>}>
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
function GapSection({
  pack,
  metrics,
  measuredIds,
}: {
  pack: InstitutionPackMeasure[] | null;
  metrics: InstitutionBusinessMetric[];
  measuredIds: Set<string>;
}) {
  const unmapped = metrics.filter((m) => m.industry_measure_id === null);
  const opportunities = (pack ?? []).filter((m) => m.addressable && !measuredIds.has(m.id));

  return (
    <Card n="03" title="The gap">
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
                <li key={m.name} className="border-b border-rule-soft py-1.5 last:border-b-0">
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

export function InstitutionPage() {
  const { id } = useParams<{ id: string }>();
  const { actor } = useActor();
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchInstitutionView>> | null>(null);

  useEffect(() => {
    if (!id || !actor) return;
    let cancelled = false;
    setResult(null);
    fetchInstitutionView(id, actor.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [id, actor]);

  if (!actor) {
    return (
      <p className="p-8 text-ink-45">
        Select an actor above to view this account — the view is scoped to the actor's own
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
      </header>

      <ClassificationSection view={view} />
      <PackSection
        pack={view.pack}
        measuredIds={measuredIds}
        isTenantSelf={view.institution.is_tenant_self}
      />
      <MetricsSection metrics={view.metrics} isTenantSelf={view.institution.is_tenant_self} />
      <GapSection pack={view.pack} metrics={view.metrics} measuredIds={measuredIds} />

      <Card n="04" title="Engagements" badge={<Badge tone="neutral">{view.engagements.length}</Badge>}>
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
    </div>
  );
}
