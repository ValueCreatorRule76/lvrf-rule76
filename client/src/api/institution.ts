// GET /api/institutions/:id/view — snake_case, exactly the shape that
// route assembles. Tenant-scoped by the signed-in actor (sign-in P2a): the
// session cookie carries it, so there is no actor argument.

import { apiFetch } from './http';

export interface InstitutionViewInstitution {
  id: string;
  name: string;
  /** What was stated at intake. Never overwritten by classification. */
  industry: string | null;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  /** As entered at creation. http(s) only — institutions_website_is_url. */
  website: string | null;
  is_tenant_self: boolean;
}

export type InstitutionFactKind = 'revenue' | 'headcount' | 'stated_priority' | 'system';

/**
 * One current institution_facts row, with its evidence row's disclosure
 * state alongside. source_verified belongs to the EVIDENCE, not the fact —
 * the fact carries no verification of its own. value_numeric is a string
 * because pg returns numeric as one; it is displayed, never parsed.
 */
export interface InstitutionFact {
  id: string;
  kind: InstitutionFactKind;
  value_numeric: string | null;
  value_text: string | null;
  unit: string | null;
  as_of: string;
  evidence_id: string;
  evidence_kind: string;
  provenance: string;
  source_reference: string | null;
  confidence: 'low' | 'medium' | 'high';
  source_verified: boolean;
  ai_sourced: boolean;
  captured_by: string;
  created_at: string;
  /** Earlier values this fact replaced, newest first (fact supersession, 0028). */
  history: InstitutionFactHistoryEntry[];
}

/**
 * A superseded fact: kept exactly as recorded, never current. superseded_at
 * and superseded_by are the correction's own time and person (the successor
 * row's created_at and captured_by); supersession_reason is why.
 */
export interface InstitutionFactHistoryEntry {
  id: string;
  value_numeric: string | null;
  value_text: string | null;
  unit: string | null;
  as_of: string;
  provenance: string;
  evidence_kind: string;
  source_verified: boolean;
  captured_by: string;
  created_at: string;
  superseded_at: string;
  superseded_by: string;
  supersession_reason: string;
}

export interface InstitutionPackMeasure {
  id: string;
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  addressable: boolean;
  why_it_pays: string;
  status: string;
}

export interface InstitutionBusinessMetric {
  id: string;
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  source_system: string;
  industry_measure_id: string | null;
}

// The server-computed gap (institutionView.ts) — the one place this
// answer is derived. unmapped_metrics and addressable_unmeasured are the
// same row shapes as `metrics` and `pack` above, because the route builds
// both lists by filtering those same two arrays, not by selecting a
// different projection of either table.
export interface InstitutionGap {
  unmapped_metrics: InstitutionBusinessMetric[];
  addressable_unmeasured: InstitutionPackMeasure[];
}

export interface InstitutionEngagement {
  id: string;
  name: string;
}

export interface InstitutionRunsSummary {
  count: number;
  latest_confidence_score: string | null;
  latest_confidence_band: string | null;
}

export interface InstitutionView {
  institution: InstitutionViewInstitution;
  facts: InstitutionFact[];
  /** NULL when unclassified — there is no pack to look up. [] is a real, classified, empty pack. */
  pack: InstitutionPackMeasure[] | null;
  metrics: InstitutionBusinessMetric[];
  gap: InstitutionGap;
  engagements: InstitutionEngagement[];
  runs: InstitutionRunsSummary;
}

export type FetchInstitutionViewResult =
  | { status: 'ok'; view: InstitutionView }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchInstitutionView(
  institutionId: string,
): Promise<FetchInstitutionViewResult> {
  let res: Response;
  try {
    res = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/view`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  const body = await res.json().catch(() => null);

  if (res.status === 404) {
    return { status: 'not_found', message: body?.message ?? `institution ${institutionId} not found` };
  }
  if (!res.ok) {
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  return { status: 'ok', view: body as InstitutionView };
}
