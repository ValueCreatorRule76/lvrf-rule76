/**
 * The confirmation gap's per-outcome half — db/DELTA_AND_PROVENANCE.md is the
 * spec; this ports records/simulate_spine.py's Spine.delta() exactly. Pure
 * computation, no I/O: the result is written into value_runs.payload.
 */

export interface DeltaInput {
  baselineValue: number;
  targetValue: number | null;
  actualValue: number | null;
  claimedCurrencyImpact: number | null;
  realizedCurrencyImpact: number | null;
  promisedMeasuredAt: string | null;
  actualMeasuredAt: string | null;
  direction: 'increase' | 'decrease';
}

export interface DeltaCurrency {
  claimed: number | null;
  realized: number | null;
  gap: number | null;
  shareOfClaim: number | null;
}

export type DeltaResult =
  | { available: false }
  | {
      available: true;
      raw: number;
      improved: boolean;
      targetMet: boolean | null;
      pctOfTarget: number | null;
      currency: DeltaCurrency;
      punctualityDays: number | null;
      onTime: boolean | null;
    };

/**
 * Matches Python's round(): ties break to even, not up. Math.round(106.25 * 10)
 * gives 1063 -> 106.3; Python's round(106.25, 1) gives 106.2. Northgate's
 * pct_of_target lands exactly on that tie (-0.34 / -0.32 * 100 == 106.25 to
 * the bit in both languages), so the tie rule is not cosmetic here — the
 * acceptance value is 106.2, and a round-half-up implementation gets it wrong
 * by a real tenth of a percent, not a formatting difference.
 */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  if (Math.abs(scaled % 1) === 0.5) {
    const floorVal = Math.floor(scaled);
    return (floorVal % 2 === 0 ? floorVal : floorVal + 1) / factor;
  }
  return Math.round(scaled) / factor;
}

/** First 10 characters ("YYYY-MM-DD") as a UTC day count — compares dates, not timestamps. */
function dateOnly(isoLike: string): number {
  const [y, m, d] = isoLike.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function computeDelta(input: DeltaInput): DeltaResult {
  if (input.actualValue == null) return { available: false };

  const rawUnrounded = input.actualValue - input.baselineValue;
  const raw = roundTo(rawUnrounded, 3);
  const improved = input.direction === 'increase' ? rawUnrounded > 0 : rawUnrounded < 0;

  const targetMet =
    input.targetValue == null
      ? null
      : input.direction === 'increase'
        ? input.actualValue >= input.targetValue
        : input.actualValue <= input.targetValue;

  const denominator = input.targetValue == null ? null : input.targetValue - input.baselineValue;
  // No direction branch here — and this looks wrong. For a decreasing metric,
  // rawUnrounded and denominator are both negative and the signs cancel: the
  // same formula is correct for increase and decrease alike (verified against
  // Northgate: -0.34 / -0.32 = 1.0625 -> 106.2%). Do not add a branch; it
  // looks like it needs one, and adding it would invert every decreasing
  // metric. db/DELTA_AND_PROVENANCE.md.
  const pctOfTarget =
    denominator == null || denominator === 0 ? null : roundTo((rawUnrounded / denominator) * 100, 1);

  const { claimedCurrencyImpact: claimed, realizedCurrencyImpact: realized } = input;
  let gap: number | null = null;
  let shareOfClaim: number | null = null;
  // claimed !== 0, not claimed != null — the guard is against dividing by a
  // zero claim, not a null one.
  if (claimed != null && realized != null && claimed !== 0) {
    gap = roundTo(realized - claimed, 2);
    shareOfClaim = roundTo(realized / claimed, 4);
  }

  let punctualityDays: number | null = null;
  let onTime: boolean | null = null;
  if (input.promisedMeasuredAt != null && input.actualMeasuredAt != null) {
    const promised = dateOnly(input.promisedMeasuredAt);
    const actual = dateOnly(input.actualMeasuredAt);
    punctualityDays = Math.round((actual - promised) / 86_400_000);
    onTime = punctualityDays <= 0;
  }

  return {
    available: true,
    raw,
    improved,
    targetMet,
    pctOfTarget,
    currency: { claimed, realized, gap, shareOfClaim },
    punctualityDays,
    onTime,
  };
}
