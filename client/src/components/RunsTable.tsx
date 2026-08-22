import { Link, useNavigate } from 'react-router-dom';
import type { RunListItem } from '../types/runsIndex';
import { Card, Badge } from './workbench/Card';

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

function HealthBandCell({ healthBand }: { healthBand: string | null }) {
  if (healthBand === null) {
    return <Badge tone="neutral">Not measured</Badge>;
  }
  return <Badge tone={HEALTH_TONE[healthBand] ?? 'neutral'}>{healthBand}</Badge>;
}

// run_number repeats across institutions (it's scoped to the engagement, not
// global) so it is never rendered without institution_name in the row beside it.
export function RunsTable({ runs }: { runs: RunListItem[] }) {
  const navigate = useNavigate();

  return (
    <Card n="01" title="Value runs">
      {runs.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No value runs recorded.</p>
      ) : (
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
              >
                <td className="border-b border-rule-soft px-3 py-[9px] font-semibold">
                  <Link to={`/runs/${r.id}`} className="text-ink hover:text-gold-ink">
                    {r.institution_name}
                  </Link>
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px] font-mono">
                  {r.run_number}
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <ProvenanceCell sourceFixture={r.source_fixture} />
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">{r.confidence_score}</td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <Badge tone={CONFIDENCE_TONE[r.confidence_band] ?? 'neutral'}>
                    {r.confidence_band}
                  </Badge>
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <HealthBandCell healthBand={r.health_band} />
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">{r.walked_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
