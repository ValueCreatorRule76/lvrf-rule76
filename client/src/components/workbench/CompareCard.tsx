import { useEffect, useState } from 'react';
import type { Run } from '../../types/run';
import { Card, Badge } from './Card';
import { fetchEngagementRuns, type FetchEngagementRunsResult } from '../../api/engagementRuns';

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

// version/fingerprint are string | null, never optional — the endpoint
// always returns the model block, and null means "this run predates model
// versioning," a fact this card must render, not silently drop by treating
// the field as absent.
interface CompareResponse {
  model: {
    version_from: string | null;
    version_to: string | null;
    fingerprint_from: string | null;
    fingerprint_to: string | null;
    comparable: boolean;
    note: string;
  };
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

/** Earlier runs supplied by the page (a retired engagement's own run list is refused), or their state. */
export type EarlierRuns = 'loading' | 'unavailable' | { id: string; run_number: number; locked_at: string | null }[];

const TITLE = 'Comparison with the previous run';
const band = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);
const health = (v: number | 'UNMEASURED') => (v === 'UNMEASURED' ? 'Unmeasured' : v);
// A failed read says so in words: never the server's message, never an id (UX-1 standard 6).
const UNAVAILABLE = "Couldn't load this engagement's earlier runs, so no comparison is shown.";

/**
 * Compares this run to its predecessor on the same engagement. The endpoint
 * this reads (compareRuns.ts) computes no narrative and no recommendation —
 * this card must not add one either. It reports the diff: what changed,
 * what didn't, and — the one thing worth calling out on its own — where the
 * score held while the evidence behind it did not.
 */
export function CompareCard({ run, earlier }: { run: Run; earlier?: EarlierRuns }) {
  const [siblingsResult, setSiblingsResult] = useState<FetchEngagementRunsResult | null>(null);

  useEffect(() => {
    if (earlier !== undefined) return;
    let cancelled = false;
    setSiblingsResult(null);
    fetchEngagementRuns(run.engagement_id).then((r) => {
      if (!cancelled) setSiblingsResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [run.engagement_id, earlier]);

  const siblings: EarlierRuns | null = earlier !== undefined ? earlier
    : siblingsResult === null ? 'loading'
    : siblingsResult.status === 'error' ? 'unavailable' : siblingsResult.runs;

  if (siblings === 'loading' || siblings === null) {
    return (
      <Card title={TITLE}>
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (siblings === 'unavailable') {
    return (
      <Card title={TITLE}>
        <p className="m-0 text-[12.5px] text-ink-70" data-testid="compare-unavailable">{UNAVAILABLE}</p>
      </Card>
    );
  }

  const earlierRuns = siblings.filter((r) => r.run_number < run.payload.runNumber);

  // Three explicit states before any comparison is attempted, each a
  // legitimate outcome in its own right, never rendered as a blank card.
  if (earlierRuns.length === 0) {
    return (
      <Card title={TITLE} badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          This is the first run on its engagement. There is nothing to compare it to.
        </p>
      </Card>
    );
  }

  if (run.locked_at === null) {
    return (
      <Card title={TITLE} badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          This run is not locked. A comparison against a record that can still change would not be reproducible,
          so one is not offered.
        </p>
      </Card>
    );
  }

  // Unlocked earlier runs are skipped, not offered — compareRuns.ts refuses
  // an unlocked run with a 409 that this reader could do nothing about.
  const lockedEarlier = earlierRuns.filter((r) => r.locked_at !== null);

  if (lockedEarlier.length === 0) {
    return (
      <Card title={TITLE} badge={<Badge tone="neutral">No comparison</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          No earlier locked run exists for this engagement.
        </p>
      </Card>
    );
  }

  const predecessor = lockedEarlier.reduce((max, r) => (r.run_number > max.run_number ? r : max));

  return <CompareBody run={run} predecessor={predecessor} />;
}

// Three weights, not one: quiet when the ruler held, HealthCard's
// gold-left-border callout when a run predates versioning and the model is
// simply unknown (a limitation of the record, not a refusal), and the
// ink-block governance-refusal treatment (Gate.tsx) when two different,
// known models scored the two runs — every delta below is suspect in a
// specific way and that earns the strongest statement this card can make.
function ModelQualification({ model }: { model: CompareResponse['model'] }) {
  if (model.comparable) {
    return (
      <p className="m-0 mb-4 text-[11.5px] text-ink-45">
        {model.note} Fingerprint <span className="font-mono">{model.fingerprint_to}</span>.
      </p>
    );
  }

  const bothKnown = model.fingerprint_from !== null && model.fingerprint_to !== null;

  if (!bothKnown) {
    return (
      <div className="mb-4 border-l-[3px] border-gold bg-offwhite px-3.5 py-3">
        <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          Model unknown
        </span>
        <p className="m-0 mt-1 text-[12.5px] text-ink">{model.note}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 border-l-[3px] border-ink bg-ink px-3.5 py-3 text-offwhite">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-offwhite/70">
        Different models
      </span>
      <p className="m-0 mt-1 text-[12.5px]">{model.note}</p>
    </div>
  );
}

function CompareBody({ run, predecessor }: { run: Run; predecessor: { id: string; run_number: number } }) {
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
      <Card title={TITLE}>
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (result.status === 'error') {
    return (
      <Card title={TITLE}>
        <p className="m-0 text-[12.5px] text-ink-70" data-testid="compare-unavailable">Couldn&apos;t load the comparison with run {predecessor.run_number}.</p>
      </Card>
    );
  }

  const c = result.data;

  return (
    <Card
      title={TITLE}
      badge={
        <Badge tone="neutral">
          run {predecessor.run_number} → run {run.payload.runNumber}
        </Badge>
      }
    >
      {/* The ruler qualification comes first — a reader must know whether the
          model changed before reading any delta below, not after. */}
      <ModelQualification model={c.model} />

      {/* A band that did not move is information, not an absence of one — never omitted. */}
      <p className="m-0 mb-4 text-[12.5px] text-ink-70" data-testid="compare-confidence">
        Run {predecessor.run_number} to run {run.payload.runNumber}: confidence{' '}
        <strong className="text-ink">{c.confidence.score_from} / 100</strong> →{' '}
        <strong className="text-ink">{c.confidence.score_to} / 100</strong> ({c.confidence.delta > 0 ? '+' : ''}{c.confidence.delta}).{' '}
        {c.confidence.band_changed
          ? <>Band changed from <strong className="text-ink">{band(c.confidence.band_from)}</strong> to <strong className="text-ink">{band(c.confidence.band_to)}</strong>.</>
          : <>Band held at <strong className="text-ink">{band(c.confidence.band_to)}</strong>.</>}
      </p>

      {/* UX-1 slice 4: stacked rows, not a table (standard 9). */}
      <ul className="m-0 list-none p-0" data-testid="compare-factors">
        {c.factors.map((f) => {
          // A zero delta is not nothing: if the evidence behind a factor
          // changed but the score it earned did not, that is the single
          // most important thing this card can show — marked, not
          // rendered identically to a row where nothing happened at all.
          const zeroDeltaNotesDiffer = f.status === 'present' && f.delta === 0 && f.note_from !== f.note_to;
          const bothNotes = f.status === 'present' && (f.delta !== 0 || zeroDeltaNotesDiffer);
          const earned = (v: number | null) => (v === null ? 'not scored' : String(v));
          return (
            <li key={f.factor} className={'border-b border-rule-soft px-1 py-2 last:border-b-0 ' + (zeroDeltaNotesDiffer ? 'bg-gold/[.10]' : '')}>
              <p className="m-0 text-[12.5px] text-ink">{f.question}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-ink-70">
                Weight {f.weight} · run {predecessor.run_number}: {earned(f.earned_from)} · run {run.payload.runNumber}: {earned(f.earned_to)}
                {' · '}
                {f.status !== 'present'
                  ? (f.status === 'added' ? 'added in this run' : 'not in this run')
                  // Non-null by construction: compareRuns.ts only sets delta to
                  // null on an 'added' or 'removed' row.
                  : `change ${f.delta! > 0 ? '+' : ''}${f.delta}`}
              </p>
              {zeroDeltaNotesDiffer && <p className="m-0 mt-1"><Badge tone="watch">Evidence changed, score held</Badge></p>}
              <div className="mt-0.5 text-[11.5px] text-ink-45" data-record>
                {f.status === 'present' && bothNotes && (
                  <>
                    <span className="block"><strong className="text-ink-70">Run {predecessor.run_number}:</strong> {f.note_from}</span>
                    <span className="block"><strong className="text-ink-70">Run {run.payload.runNumber}:</strong> {f.note_to}</span>
                  </>
                )}
                {f.status === 'present' && !bothNotes && <span>{f.note_to}</span>}
                {f.status === 'added' && <span>{f.note_to}</span>}
                {f.status === 'removed' && <span>{f.note_from}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-8">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Health composite
          </span>
          <p className="m-0 font-display text-[17px] tracking-[.05em]">
            {health(c.health.composite_from)} → {health(c.health.composite_to)}
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
