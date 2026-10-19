// GET /api/institutions/:id/pov — O2's one read for the account POV and the
// account page's hypothesis, summary and reference-example cards. snake_case,
// exactly the shape server/routes/valueHypotheses.ts assembles. Every
// derived value (basis, verdict, the falsifier sentence, the banners) is
// computed there; the client renders, it never infers.

import { apiFetch } from './http';

export type Basis = 'system_of_record' | 'published' | 'client_stated' | 'inferred' | 'assumed';
export type Verdict = 'open' | 'survived' | 'refuted' | 'survived_post_hoc' | 'refuted_post_hoc' | 'withdrawn' | 'superseded';

/** UX-1-D3: the marker kinds (reference_example_kind), and how each reads. One place: the POV banner and the account page both read it. */
export type MarkerKind = 'published_case_study' | 'demonstration' | 'outside_in_test';
export const MARKER_KIND: Record<MarkerKind, { label: string; banner: string }> = {
  outside_in_test: { label: 'Outside-in test', banner: 'OUTSIDE-IN TEST — built from published material, not a customer engagement' },
  published_case_study: { label: 'Published case study', banner: 'REFERENCE EXAMPLE — a published case study, not an engagement' },
  demonstration: { label: 'Demonstration', banner: 'DEMONSTRATION — built for show, not an engagement' },
};

export interface ReferenceMarker {
  id: string;
  kind: MarkerKind;
  source_citation: string;
  note: string;
  marked_by: string;
  marked_at: string;
  current: boolean;
  unmarked_at: string | null;
  unmarked_by: string | null;
  unmark_reason: string | null;
  superseded_by_id: string | null;
  supersession_reason: string | null;
}

export interface PovFact {
  id: string;
  kind: string;
  value_numeric: string | null;
  value_text: string | null;
  unit: string | null;
  as_of: string;
  evidence_kind: string;
  provenance: string;
  source_verified: boolean;
  citation_resolved: boolean;
  citation_resolved_by: string | null;
  basis: Basis | null;
}

export interface PovEngagement {
  id: string;
  name: string;
  /** The stage reached: the furthest of the engagement's own and its current outcomes'. */
  value_stage: string;
  /** The engagement row's own value_stage, as recorded. */
  engagement_stage: string;
  /** Whether a current outcome of the engagement has a named committer. */
  committed: boolean;
  retired: boolean;
  latest_locked_run: PovLockedRun | null;
  /** Q4m: every locked run of the engagement, oldest first. */
  locked_runs: PovLockedRun[];
}

export interface PovLockedRun {
  id: string;
  run_number: number;
  confidence_score: string | null;
  confidence_band: string | null;
  locked_at: string;
  payload_hash: string;
}

export interface PovEvidence {
  supports: string;
  kind: string;
  summary: string;
  provenance: string;
  basis: Basis | null;
}

export interface PackEntryRef {
  id: string;
  name: string;
  direction: 'increase' | 'decrease';
  unit?: string;
  confounders: string;
}

export interface PovOutcome {
  id: string;
  engagement_id: string;
  /** Q4m: the outcome's engagement is retired, so the outcome is frozen. */
  engagement_retired: boolean;
  metric_name: string;
  unit: string | null;
  capability_name: string;
  offerings: { offering_key: string; name: string }[];
  baseline_value: string;
  baseline_measured_on: string;
  target_value: string | null;
  committed_by: string | null;
  committed_on: string | null;
  actual_value: string | null;
  actual_measured_on: string | null;
  verified_by: string | null;
  source_verified: boolean;
  realization: string;
  industry_measure_id: string | null;
  pack_entry: PackEntryRef | null;
  evidence: PovEvidence[];
}

export interface PovHypothesis {
  id: string;
  value_outcome_id: string;
  statement: string;
  verdict: Verdict;
  post_hoc: boolean;
  falsifier_reference: 'baseline' | 'committed_target';
  reference_value: string;
  reference_recorded_on: string;
  falsifier_due: string;
  falsifier_conditions: string;
  metric_name: string;
  unit: string | null;
  direction: 'increase' | 'decrease';
  direction_label: string;
  falsifier_text: string;
  lever: { id: string; name: string; mechanism: string; leading_indicator: string; citation: string; status: string; withdrawn: boolean };
  pack_entry: PackEntryRef;
  author: string;
  created_at: string;
  superseded_by_id: string | null;
  supersession_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawal_reason: string | null;
}

export interface ExecutiveSummary {
  id: string;
  lens: 'cfo' | 'chro' | 'board' | 'general';
  body: string;
  author: string;
  drafted_with_ai: boolean;
  drafting_tool: string | null;
  created_at: string;
  supersedes_id: string | null;
  value_run_id: string | null;
  current: boolean;
}

export interface PovLever {
  id: string;
  name: string;
  mechanism: string;
  industry_measure_id: string;
  pack_entry_name: string;
  direction: 'increase' | 'decrease';
}

export interface Pov {
  institution: { id: string; name: string; industry_name: string | null; industry_slug: string | null };
  reference_example: ReferenceMarker | null;
  reference_markers: ReferenceMarker[];
  entity: { legal_name: string; identifier_type: string; identifier: string; registry_jurisdiction: string | null; basis: Basis | null } | null;
  facts: PovFact[];
  engagements: PovEngagement[];
  outcomes: PovOutcome[];
  hypotheses: PovHypothesis[];
  executive_summaries: ExecutiveSummary[];
  levers: PovLever[];
  banners: { outside_in: boolean; unverified: boolean };
  /** The value spine, in order, read from the value_stage enum (never restated here). */
  value_spine: string[];
}

export type PovResult =
  | { status: 'ok'; pov: Pov }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchPov(institutionId: string): Promise<PovResult> {
  try {
    const res = await apiFetch(`/api/institutions/${institutionId}/pov`);
    const body = await res.json().catch(() => null);
    if (res.status === 404) return { status: 'not_found', message: body?.message ?? 'not found' };
    if (!res.ok) return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
    return { status: 'ok', pov: body as Pov };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }
}

/** A recorded numeric as recorded, without trailing zeros (as the server's `recorded`). */
export function recorded(v: string | null): string | null {
  if (v === null) return null;
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}

/** How each verdict reads. Refuted is a first-class result (O2-D1); post hoc says so (O2-D3). */
export const VERDICT_LABEL: Record<Verdict, string> = {
  open: 'Open — no verified actual past the due date yet',
  survived: 'Survived — the verified actual beat the reference',
  refuted: 'Refuted — the verified actual was no better than the reference',
  survived_post_hoc: 'Post hoc: written after the result — not a test',
  refuted_post_hoc: 'Post hoc, refuted: written after the result',
  withdrawn: 'Withdrawn',
  superseded: 'Superseded by a later version',
};


export const NO_NUMBERS = 'Numbers belong in recorded values, not falsifier conditions.';

export const VERDICT_TONE: Record<Verdict, 'healthy' | 'critical' | 'neutral' | 'watch'> = {
  open: 'neutral', survived: 'healthy', refuted: 'critical',
  survived_post_hoc: 'watch', refuted_post_hoc: 'watch', withdrawn: 'neutral', superseded: 'neutral',
};
