// Shape of GET /api/runs/:id — the value_runs row, snake_case, payload
// included as stored. Only the fields this app actually reads are typed;
// the row (and the payload) carry more than this.

export interface RunEvent {
  category: string;
  producer: string;
  eventType: string;
  // heartbeat_events.value_stage is nullable by design — a system-level
  // event (HB-0001 system init, HB-0002 authentication) is not tied to any
  // spine stage. walkSpine.ts's own emitted events always set one, but
  // produceRun.ts reads this column unfiltered for any heartbeat_events row
  // tied to the engagement, so a stored payload can legitimately carry null.
  valueStage: string | null;
  contentHash: string;
  healthState: string;
  heartbeatId: string;
}

export interface HealthDimension {
  dimension: string;
  weight: number;
  score: number | null;
  state: 'measured' | 'UNMEASURED';
  events?: number;
}

export interface RunHealth {
  // Null when no dimension has a measured event — computeHealth
  // (server/spine/healthModel.ts) never scores unmeasured as zero and
  // never assumes compliance. Every reader must render an explicit
  // unmeasured state, not call a string/number method on these directly.
  band: string | null;
  basis: string;
  composite: number | null;
  dimensions: HealthDimension[];
  coverage_pct: number;
}

export interface Finding {
  code: string;
  message: string;
  severity: string;
}

export type ConfidenceFactorKey =
  | 'metric_definition_confirmed'
  | 'baseline_evidence_verified'
  | 'actual_evidence_verified'
  | 'impact_basis_evidenced'
  | 'human_commit_of_record'
  | 'human_verifier_of_record';

export interface ConfidenceFactor {
  factor: ConfidenceFactorKey;
  question: string;
  weight: number;
  earned: number;
  note: string;
}

export interface RunConfidence {
  score: number;
  band: string;
  method: string;
  factors: ConfidenceFactor[];
  // Mirrors ConfidenceResult.asserted in confidenceModel.ts, itself typed
  // nullable to match assertedConfidence's input type. Never actually null
  // today — value_outcomes.confidence is NOT NULL with a default, so every
  // live caller supplies one — but the type this is meant to mirror allows
  // it, and asserting otherwise is exactly how the other three fields in
  // this file went stale.
  asserted: string | null;
  overridesAssertion: boolean;
}

// Added after the first runs in this database were walked. Older runs'
// payload.businessMetric is still a bare string — do not assume the
// object shape without checking; see isEnrichedBusinessMetric below.
export interface BusinessMetricDetail {
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  sourceSystem: string;
}

// Snapshot at walk time, not a live read — see walkSpine.ts. Absent
// entirely on runs walked before this field existed; never back-filled.
export interface EvidenceItem {
  kind: string;
  summary: string;
  provenance: string;
  source_reference: string | null;
  confidence: string;
  source_verified: boolean;
  ai_sourced: boolean;
  citation_resolved: boolean;
  supports: string;
  // Added 24 August; produceRun.ts writes both into every evidence
  // snapshot. Without these the evidence ledger cannot disclose that a
  // row is vendor-published or simulated — the exact fact
  // lvrf_block_ai_actual refuses an actual on.
  simulated: boolean;
  vendor_published: boolean;
}

export interface RunDeltaCurrency {
  claimed: number | null;
  realized: number | null;
  gap: number | null;
  share_of_claim: number | null;
}

// Mirrors server/spine/deltaEngine.ts's DeltaResult exactly, including the
// discriminated union: computeDelta returns { available: false } with none
// of the other fields when actualValue is null. The previous flat shape
// (every field always present) was written from the Customer Zero fixture,
// where actualValue is always set, rather than from this return type — the
// same defect class as RunHealth.composite/band and
// RunPayload.targetValue/actualValue.
export type RunDelta =
  | { available: false }
  | {
      available: true;
      raw: number;
      improved: boolean;
      target_met: boolean | null;
      pct_of_target: number | null;
      currency: RunDeltaCurrency;
      punctuality_days: number | null;
      on_time: boolean | null;
    };

// value_runs.payload, as stored — the same object render_record.py reads.
export interface RunPayload {
  engagement: string;
  capability: string;
  // Bare string on runs walked before businessMetric was enriched; an
  // object with unit/direction/sourceSystem on runs walked after.
  businessMetric: string | BusinessMetricDetail;
  runNumber: number;
  realization: string;
  disclosure: string;
  baselineValue: number;
  // Null before commit / measure respectively — legitimately absent, not
  // a zero. Every reader must render an explicit not-yet-reached state.
  targetValue: number | null;
  actualValue: number | null;
  // value_outcomes.claimed_currency_impact / realized_currency_impact are
  // nullable columns; walkSpine.ts and produceRun.ts both pass them
  // through unguarded. Null is the common case — no basis exists for a
  // currency figure at baseline (impact_requires_basis would demand one).
  claimedCurrencyImpact: number | null;
  realizedCurrencyImpact: number | null;
  delta: RunDelta;
  health: RunHealth;
  confidence: RunConfidence;
  findings: Finding[];
  events: RunEvent[];
  sourceFixture: string;
  // Absent on runs walked before this field existed.
  evidence?: EvidenceItem[];
  // Provenance banner — records/render_record.py's page-one banner, states
  // whether the engagement itself is real, independent of verification
  // status. Absent on runs walked before this field existed; not back-filled.
  note?: string;
  bannerTitle?: string;
}

export function isEnrichedBusinessMetric(
  bm: string | BusinessMetricDetail,
): bm is BusinessMetricDetail {
  return typeof bm !== 'string';
}

/** The metric's display name regardless of which payload shape this run has. */
export function businessMetricName(bm: string | BusinessMetricDetail): string {
  return isEnrichedBusinessMetric(bm) ? bm.name : bm;
}

// value_runs row, as GET /api/runs/:id returns it (SELECT *).
export interface Run {
  id: string;
  tenant_id: string;
  engagement_id: string;
  run_number: number;
  terminal_value_stage: string;
  source_fixture: string | null;
  walked_at: string;
  locked_at: string | null;
  payload: RunPayload;
}
