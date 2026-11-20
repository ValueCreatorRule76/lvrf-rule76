import { Link, useNavigate } from 'react-router-dom';
import type { RunListItem } from '../types/runsIndex';
import { Card, Badge } from './workbench/Card';
import { CaseLinks } from './valueCase/CaseLinks';

const CONFIDENCE_TONE: Record<string, 'healthy' | 'watch' | 'critical'> = {
  high: 'healthy',
  medium: 'watch',
  low: 'critical',
};

const HEALTH_TONE: Record<string, 'healthy' | 'watch' | 'warning' | 'critical' | 'failure'> = {
  healthy: 'healthy',
  watch: 'watch',
  warning: 'warning',
  critical: 'critical',
  constitutional_failure: 'failure',
};

// source_fixture is provenance, not metadata — rendered as a Badge like the
// band columns, not as muted text, and a missing value gets a stated reason
// rather than a blank cell or a dash that could be misread as a value.
function ProvenanceCell({ sourceFixture }: { sourceFixture: string | null }) {
  if (sourceFixture === null) {
    return <Badge tone="warning">Provenance unknown</Badge>;
  }
  return <Badge tone="neutral">{sourceFixture}</Badge>;
}

function HealthBandCell({
  healthBand,
  healthCoveragePct,
}: {
  healthBand: string | null;
  healthCoveragePct: number | null;
}) {
  if (healthBand === null) {
    return <Badge tone="neutral">Not measured</Badge>;
  }
  // Coverage IN the badge, not beside it — same wording as HealthCard.tsx's
  // own health badge. A band with no coverage figure reads as "healthy" when
  // the honest reading of e.g. 25% coverage is a quarter of the dimension
  // weight measured and scored well, not the whole picture.
  return (
    <Badge tone={HEALTH_TONE[healthBand] ?? 'neutral'}>
      {healthBand} · {healthCoveragePct}%
    </Badge>
  );
}

// run_number repeats across institutions (it's scoped to the engagement, not
// global) so it is never rendered without institution_name in the row beside it.
export function RunsTable({ runs, focusId = null }: { runs: RunListItem[]; focusId?: string | null }) {
  const navigate = useNavigate();

  return (
    <Card n="00" title="Value runs">
      {runs.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No value runs recorded.</p>
      ) : (
        // S5: at 390 the table scrolls inside its own box; the page never scrolls sideways (the approved mock-up).
        <div className="overflow-x-auto" data-testid="runs-table-scroll">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {['Institution', 'Run #', 'Provenance', 'Confidence', 'Band', 'Health', 'Walked'].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-silver px-3 py-[9px] text-left text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/runs/${r.id}`)}
                className="cursor-pointer hover:bg-offwhite"
                data-testid="runs-row" data-account={r.institution_id ?? ''}
              >
                <td className={'border-b border-rule-soft px-3 py-[9px] font-semibold' + (focusId && r.institution_id === focusId ? ' shadow-[inset_3px_0_0_theme(colors.gold)]' : '')}>
                  {/* The account view, not the run — a different destination from the
                      row's own click-through, so this link stops the click from also
                      bubbling into the row's navigate(`/runs/${r.id}`) above. Null only
                      when the owning institution has since been retired (L26: a
                      retired ENGAGEMENT keeps its account, marked below) — the run
                      still shows, with no owner to link to. */}
                  {r.institution_id && r.institution_name ? (
                    <Link
                      to={`/accounts/${r.institution_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink hover:text-gold-ink"
                    >
                      {r.institution_name}
                    </Link>
                  ) : (
                    <span className="text-ink-45">no institution</span>
                  )}
                  {/* L26: the account stays shown for a retired engagement's runs,
                      marked — "retired" is not "unknown account". */}
                  {/* S5 (D3): with every account's runs shown, the account in focus's are marked, in words. */}
                  {focusId && r.institution_id === focusId && (
                    <span className="ml-2 text-[9.5px] font-semibold uppercase tracking-[.12em] text-gold-ink" data-testid="runs-in-focus">In focus</span>
                  )}
                  {r.engagement_retired && (
                    <span className="ml-2 border border-silver px-1 py-px text-[9px] font-semibold uppercase tracking-[.12em] text-ink-45">
                      retired engagement
                    </span>
                  )}
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px] font-mono">
                  {r.run_number}
                  {/* S1 (§20 item 3): the value case, both lenses, per row. */}
                  {/* S5 Gate B finding (Brad, 20 Nov 2026): the links wrap, so the table fits its card from 1024 px. */}
                  <span className="block font-sans text-[11px]" data-testid="runs-case-links"><CaseLinks runId={r.id} testid="runs-case-link" /></span>
                </td>
                {/* S5 Gate B finding: a long provenance label wraps in its badge, never widening the table past its card. */}
                <td className="max-w-[220px] border-b border-rule-soft px-3 py-[9px] [&_span]:whitespace-normal">
                  <ProvenanceCell sourceFixture={r.source_fixture} />
                  {/* C3b (ruling 5): a sealed label is shown as recorded at sealing, with its unsourced-figure erratum beneath. */}
                  {r.unsourced_line && <span className="block text-[11px] text-warning" data-testid="runs-unsourced"><span className="text-ink-45">as recorded at sealing · </span>{r.unsourced_line}</span>}
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">{r.confidence_score}
                  {/* C3: a run's current errata, and its system-exercise mark, beside its score. */}
                  {r.erratum_line && <span className="block text-[11px] text-warning" data-testid="runs-erratum">{r.erratum_line}</span>}
                  {r.system_exercise && <span className="block text-[11px] font-semibold text-warning" data-testid="runs-system-exercise" title={r.system_exercise.reason}>SYSTEM EXERCISE</span>}</td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <Badge tone={CONFIDENCE_TONE[r.confidence_band] ?? 'neutral'}>
                    {r.confidence_band}
                  </Badge>
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <HealthBandCell
                    healthBand={r.health_band}
                    healthCoveragePct={r.health_coverage_pct}
                  />
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">{r.walked_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Card>
  );
}
