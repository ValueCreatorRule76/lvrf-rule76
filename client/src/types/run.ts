// Shape of GET /api/runs/:id — the value_runs row, snake_case, payload
// included as stored. Only the fields this app actually reads are typed;
// the row (and the payload) carry more than this.

export interface RunEvent {
  category: string;
  producer: string;
  eventType: string;
  valueStage: string;
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
  band: string;
  basis: string;
  composite: number;
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
  asserted: string;
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
}

export interface RunDelta {
  raw: number;
  improved: boolean;
  available: boolean;
  target_met: boolean;
  on_time: boolean;
  pct_of_target: number;
  punctuality_days: number;
  currency: {
    claimed: number;
    realized: number;
    gap: number;
    share_of_claim: number;
  };
}

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
  targetValue: number;
  actualValue: number;
  claimedCurrencyImpact: number;
  realizedCurrencyImpact: number;
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
