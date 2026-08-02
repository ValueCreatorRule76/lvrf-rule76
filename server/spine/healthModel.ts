/**
 * LVRF Institutional Health Model — db/HEALTH_MODEL.md is the canonical spec;
 * this is its one implementation. COMPASS-HEARTBEAT-STATUS §7, as amended by
 * AMENDMENT-003. Previously existed only in records/simulate_spine.py, which
 * the client zero milestone retires.
 *
 * Health measures faithfulness, not performance. A dimension with no events
 * is UNMEASURED — never scored zero, never assumed compliant — and excluded
 * from the composite's denominator. That exclusion, published as coverage
 * alongside the composite, is what makes the number trustworthy.
 */

export type HealthState = 'healthy' | 'watch' | 'warning' | 'critical' | 'constitutional_failure';

const STATE_SCORE: Record<HealthState, number> = {
  healthy: 100,
  watch: 85,
  warning: 68,
  critical: 50,
  constitutional_failure: 30,
};

/** Weights sum to 100. Order matches db/HEALTH_MODEL.md's table. */
const HEALTH_DIMENSIONS: ReadonlyArray<readonly [string, number]> = [
  ['Constitutional Compliance', 25],
  ['Governance Integrity', 25],
  ['Operational Health', 15],
  ['Data Integrity', 10],
  ['Security', 10],
  ['Financial / Value Realization', 10],
  ['Learning & Improvement', 5],
];

/** Total mapping — every constitutional category maps to exactly one dimension. */
const CATEGORY_TO_DIMENSION: Record<string, string> = {
  constitutional: 'Constitutional Compliance',
  governance: 'Governance Integrity',
  operational: 'Operational Health',
  integrity: 'Data Integrity',
  security: 'Security',
  financial: 'Financial / Value Realization',
  learning: 'Learning & Improvement',
};

/**
 * One heartbeat event as the model needs it. `healthWeight` is the
 * within-dimension weight (from the heartbeat register — loadHeartbeatRegister
 * must select it). `category` determines the dimension. Two different
 * weightings; conflating them produces plausible numbers that don't match
 * the acceptance values.
 */
export interface HealthEventInput {
  heartbeatId: string;
  category: string;
  healthWeight: number;
  healthState: HealthState;
}

export interface HealthDimensionRow {
  dimension: string;
  weight: number;
  score: number | null;
  state: 'measured' | 'UNMEASURED';
  events?: number;
}

export interface UnmappedHealthEvent {
  heartbeatId: string;
  category: string;
}

export interface HealthResult {
  dimensions: HealthDimensionRow[];
  /** Null only if nothing was measured — no mappable events at all. */
  composite: number | null;
  band: HealthState | null;
  /**
   * Sum of measured dimension weights, published alongside the composite per
   * AMD-003 III. Snake_case, matching records/render_record.py's
   * `h['coverage_pct']` — checked against that file, not guessed.
   */
  coverage_pct: number;
  /** Narrative AMD-003 III requires alongside the composite — render_record.py's `h['basis']`. */
  basis: string;
  /** Events whose category had no dimension — db/FINDINGS_MODEL.md's F1, should not occur today. */
  unmappedEvents: UnmappedHealthEvent[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeHealth(events: HealthEventInput[]): HealthResult {
  const buckets = new Map<string, Array<{ weight: number; score: number }>>();
  const unmappedEvents: UnmappedHealthEvent[] = [];

  for (const e of events) {
    const dimension = CATEGORY_TO_DIMENSION[e.category];
    if (!dimension) {
      unmappedEvents.push({ heartbeatId: e.heartbeatId, category: e.category });
      continue;
    }
    const rows = buckets.get(dimension) ?? [];
    rows.push({ weight: e.healthWeight, score: STATE_SCORE[e.healthState] });
    buckets.set(dimension, rows);
  }

  const dimensions: HealthDimensionRow[] = [];
  let measuredWeight = 0;
  let weighted = 0;

  for (const [name, weight] of HEALTH_DIMENSIONS) {
    const rows = buckets.get(name);
    if (!rows || rows.length === 0) {
      dimensions.push({ dimension: name, weight, score: null, state: 'UNMEASURED' });
      continue;
    }
    const weightSum = rows.reduce((sum, r) => sum + r.weight, 0);
    // Unrounded score feeds the composite; only the displayed per-dimension
    // value is rounded. Rounding here first would shift the composite.
    const scoreUnrounded = rows.reduce((sum, r) => sum + r.weight * r.score, 0) / weightSum;
    dimensions.push({ dimension: name, weight, score: round1(scoreUnrounded), state: 'measured', events: rows.length });
    weighted += scoreUnrounded * weight;
    measuredWeight += weight;
  }

  const composite = measuredWeight > 0 ? round1(weighted / measuredWeight) : null;
  const band: HealthState | null =
    composite == null
      ? null
      : composite >= 90
        ? 'healthy'
        : composite >= 75
          ? 'watch'
          : composite >= 60
            ? 'warning'
            : composite >= 40
              ? 'critical'
              : 'constitutional_failure';

  const basis =
    `Weighted over ${measuredWeight}% of defined dimension weight. Unmeasured dimensions are ` +
    'excluded from the denominator rather than assumed compliant.';

  return { dimensions, composite, band, coverage_pct: measuredWeight, basis, unmappedEvents };
}
