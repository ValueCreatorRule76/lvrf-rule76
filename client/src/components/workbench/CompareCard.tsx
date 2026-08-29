import { Fragment, useEffect, useState } from 'react';
import type { Run } from '../../types/run';
import { Card, Badge } from './Card';
import { fetchEngagementRuns, type EngagementRun, type FetchEngagementRunsResult } from '../../api/engagementRuns';

// Shape of GET /api/value-runs/:baselineRunId/compare/:comparisonRunId — only
// the fields this card renders. server/routes/compareRuns.ts also returns
// `stage`, `claim` and `notes` blocks; this card does not show them, so they
// are left untyped here rather than declared and ignored.
interface CompareFactor {
  factor: string;
  question: string;
  weight: number;
  earned_from: number | null;
  earned_to: number | null;
  delta: number | null;
  note_from: string | null;
  note_to: string | null;
  status: 'present' | 'added' | 'removed';
}

interface CompareResponse {
  confidence: {
    score_from: number;
    score_to: number;
    delta: number;
    band_from: string;
    band_to: string;
    band_changed: boolean;
  };
  factors: CompareFactor[];
  health: {
    composite_from: number | 'UNMEASURED';
    composite_to: number | 'UNMEASURED';
    coverage_from: number;
    coverage_to: number;
  };
}

type CompareFetchResult =
  | { status: 'ok'; data: CompareResponse }
  | { status: 'error'; message: string };

// Same result-union pattern as client/src/api/runsIndex.ts, kept local
// rather than a fourth new file — this card is the only caller.
async function fetchCompare(baselineRunId: string, comparisonRunId: string): Promise<CompareFetchResult> {
  let res: Response;
  try {
    res = await fetch(`/api/value-runs/${baselineRunId}/compare/${comparisonRunId}`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const data = (await res.json()) as CompareResponse;
  return { status: 'ok', data };
}

/**
 * Compares this run to its predecessor on the same engagement. The endpoint
 * this reads (compareRuns.ts) computes no narrative and no recommendation —
 * this card must not add one either. It reports the diff: what changed,
 * what didn't, and — the one thing worth calling out on its own — where the
 * score held while the evidence behind it did not.
 */
export function CompareCard({ run }: { run: Run }) {
  const [siblingsResult, setSiblingsResult] = useState<FetchEngagementRunsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSiblingsResult(null);
    fetchEngagementRuns(run.engagement_id).then((r) => {
      if (!cancelled) setSiblingsResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [run.engagement_id]);

  if (!siblingsResult) {
    return (
      <Card n="05" title="Compare to predecessor">
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (siblingsResult.status === 'error') {
    return (
      <Card n="05" title="Compare to predecessor">
        <p className="m-0 text-[12.5px] text-critical">{siblingsResult.message}</p>
      </Card>
    );
  }

  const earlier = siblingsResult.runs.filter((r) => r.run_number < run.payload.runNumber);

  // Three explicit states before any comparison is attempted, each a
  // legitimate outcome in its own right, never rendered as a blank card.
  if (earlier.length === 0) {
    return (
      <Card n="05" title="Compare to predecessor" badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          This is the first run on its engagement. There is nothing to compare it to.
        </p>
      </Card>
    );
  }

  if (run.locked_at === null) {
    return (
      <Card n="05" title="Compare to predecessor" badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          This run is not locked. A comparison against a mutable record would not be reproducible,
          so one is not offered.
        </p>
      </Card>
    );
  }

  // Unlocked earlier runs are skipped, not offered — compareRuns.ts refuses
  // an unlocked run with a 409 that this reader could do nothing about.
  const lockedEarlier = earlier.filter((r) => r.locked_at !== null);

  if (lockedEarlier.length === 0) {
    return (
      <Card n="05" title="Compare to predecessor" badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          No earlier locked run exists for this engagement.
        </p>
      </Card>
    );
  }

  const predecessor = lockedEarlier.reduce((max, r) => (r.run_number > max.run_number ? r : max));

  return <CompareBody run={run} predecessor={predecessor} />;
}

function CompareBody({ run, predecessor }: { run: Run; predecessor: EngagementRun }) {
  const [result, setResult] = useState<CompareFetchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    fetchCompare(predecessor.id, run.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [predecessor.id, run.id]);

  if (!result) {
    return (
      <Card n="05" title="Compare to predecessor">
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (result.status === 'error') {
    return (
      <Card n="05" title="Compare to predecessor">
        <p className="m-0 text-[12.5px] text-critical">{result.message}</p>
      </Card>
    );
  }

  const c = result.data;

  return (
    <Card
      n="05"
      title="Compare to predecessor"
      badge={
        <Badge tone="neutral">
          run {predecessor.run_number} → run {run.payload.runNumber}
        </Badge>
      }
    >
      {/* A band that did not move is information, not an absence of one — never omitted. */}
      <p className="m-0 mb-4 text-[12.5px] text-ink-70">
        Run {predecessor.run_number} to run {run.payload.runNumber}: confidence{' '}
        <strong className="text-ink">{c.confidence.score_from}</strong> →{' '}
        <strong className="text-ink">{c.confidence.score_to}</strong> (
        {c.confidence.delta > 0 ? '+' : ''}
        {c.confidence.delta}).{' '}
        {c.confidence.band_changed ? (
          <>
            Band changed from <strong className="text-ink">{c.confidence.band_from.toUpperCase()}</strong> to{' '}
            <strong className="text-ink">{c.confidence.band_to.toUpperCase()}</strong>.
          </>
        ) : (
          <>
            Band held at <strong className="text-ink">{c.confidence.band_to.toUpperCase()}</strong>.
          </>
        )}
      </p>

      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {['Factor', 'Weight', 'Earned from', 'Earned to', 'Delta'].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap border-b border-silver px-3 py-[9px] text-left text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.factors.map((f) => {
            // A zero delta is not nothing: if the evidence behind a factor
            // changed but the score it earned did not, that is the single
            // most important thing this card can show — marked, not
            // rendered identically to a row where nothing happened at all.
            const zeroDeltaNotesDiffer =
              f.status === 'present' && f.delta === 0 && f.note_from !== f.note_to;
            const bothNotes = f.status === 'present' && (f.delta !== 0 || zeroDeltaNotesDiffer);
            const rowClass = zeroDeltaNotesDiffer ? 'bg-gold/[.10]' : undefined;

            return (
              <Fragment key={f.factor}>
                <tr className={rowClass}>
                  <td className="border-b border-rule-soft px-3 py-[9px]">{f.question}</td>
                  <td className="border-b border-rule-soft px-3 py-[9px] text-ink-45">{f.weight}%</td>
                  <td className="border-b border-rule-soft px-3 py-[9px]">
                    {f.earned_from === null ? (
                      <span className="italic text-ink-45">—</span>
                    ) : (
                      f.earned_from
                    )}
                  </td>
                  <td className="border-b border-rule-soft px-3 py-[9px]">
                    {f.earned_to === null ? <span className="italic text-ink-45">—</span> : f.earned_to}
                  </td>
                  <td className="border-b border-rule-soft px-3 py-[9px]">
                    {f.status !== 'present' ? (
                      <Badge tone="neutral">{f.status}</Badge>
                    ) : (
                      // Non-null by construction: compareRuns.ts only sets
                      // delta to null on an 'added' or 'removed' row, and
                      // this branch is reached only when status is 'present'.
                      <>
                        {f.delta! > 0 ? '+' : ''}
                        {f.delta}
                      </>
                    )}
                  </td>
                </tr>
                <tr className={rowClass}>
                  <td
                    colSpan={5}
                    className="border-b border-rule-soft px-3 pb-[9px] pt-0 text-[11.5px] text-ink-45"
                  >
                    {zeroDeltaNotesDiffer && (
                      <div className="mb-1">
                        <Badge tone="watch">Evidence changed, score held</Badge>
                      </div>
                    )}
                    {f.status === 'present' && bothNotes && (
                      <>
                        <span className="block">
                          <strong className="text-ink-70">From:</strong> {f.note_from}
                        </span>
                        <span className="block">
                          <strong className="text-ink-70">To:</strong> {f.note_to}
                        </span>
                      </>
                    )}
                    {f.status === 'present' && !bothNotes && <span>{f.note_to}</span>}
                    {f.status === 'added' && <span>{f.note_to}</span>}
                    {f.status === 'removed' && <span>{f.note_from}</span>}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex gap-8">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Health composite
          </span>
          <p className="m-0 font-display text-[17px] tracking-[.05em]">
            {c.health.composite_from} → {c.health.composite_to}
          </p>
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Coverage
          </span>
          <p className="m-0 font-display text-[17px] tracking-[.05em]">
            {c.health.coverage_from}% → {c.health.coverage_to}%
          </p>
        </div>
      </div>
    </Card>
  );
}
