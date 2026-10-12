// GET /api/industries and GET /api/industries/:slug/pack — snake_case,
// exactly the columns those routes select (same convention as
// types/runsIndex.ts's RunListItem).
//
// Both endpoints are tenant-scoped by the signed-in actor (sign-in P2a):
// the session cookie carries it, so neither takes an actor argument — and
// there is still no ambient default to fall back on, because without a
// session the server answers 401.

import { apiFetch } from './http';

export interface IndustryListItem {
  id: string;
  name: string;
  slug: string;
  measure_count: number;
}

/** O1 (§5): a solution that pulls a lever, beside what it can evidence. */
/** O1: who withdrew a lever or a link, when and why — never deleted, shown marked. */
export interface Withdrawal {
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawal_reason: string | null;
}

export interface LeverSolution extends Withdrawal {
  /** The lever_offerings row, for "Withdraw…". */
  id: string;
  offering_key: string;
  name: string;
  family: string;
  evidence_class: string;
  verification_source: string;
  basis: string;
  linked_by: string;
  linked_at: string;
}

/** O1 (§5): a value lever on a pack entry — a mechanism, not a promise (no effect size). */
export interface ValueLever extends Withdrawal {
  id: string;
  name: string;
  mechanism: string;
  leading_indicator: string;
  citation: string;
  status: string;
  proposed_by: string;
  created_at: string;
  solutions: LeverSolution[];
}

export interface CatalogOffering {
  offering_key: string;
  name: string;
  family: string;
  evidence_class: string;
  verification_source: string;
}

export interface IndustryMeasure {
  /** Q4c1b: the entry's id, for the steward's "Retire this entry…". */
  id: string;
  /** O1: the entry's levers (current, then withdrawn), each with its solutions. */
  levers: ValueLever[];
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  definition: string;
  why_it_pays: string;
  addressable: boolean;
  addressable_reasoning: string;
  confounders: string;
  citation: string;
  status: string;
  /**
   * The accepted research result behind this entry. Null only if none is
   * on record — never invented. `note` is the reviewer's own caveat.
   */
  review: {
    note: string | null;
    reviewed_by: string | null;
    reviewed_at: string;
    research_tool: string | null;
    parsed_at: string | null;
  } | null;
}

/** A measure a person judged does not belong in this pack at all. */
export interface IndustryExclusion {
  name: string;
  /** The person's judgement. */
  reason: string;
  citation: string | null;
  excluded_at: string;
  excluded_by: string;
  /** When a research run proposed it: its tool, and its wording verbatim. Both or neither. */
  proposed_by_research_tool: string | null;
  proposal_text: string | null;
}

/**
 * Q4c1b: an entry a steward retired from the pack — shown, not hidden.
 * The retirement leads; the review it was first accepted on follows.
 */
export interface IndustryRetiredMeasure {
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  citation: string;
  retired_at: string;
  /** Null only for an entry retired before 0032 (none on prod). */
  retired_by: string | null;
  retirement_reason: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Excluded since: it cannot return. Otherwise a new accepted result can bring it back. */
  excluded: boolean;
}

export interface IndustryPack {
  industry: { id: string; name: string; slug: string };
  measures: IndustryMeasure[];
  exclusions: IndustryExclusion[];
  retired: IndustryRetiredMeasure[];
  /** O1: the tenant's offering catalog, for "Link a solution…". */
  offerings: CatalogOffering[];
}

export type FetchIndustriesResult =
  | { status: 'ok'; industries: IndustryListItem[] }
  | { status: 'error'; message: string };

export type FetchIndustryPackResult =
  | { status: 'ok'; pack: IndustryPack }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchIndustries(): Promise<FetchIndustriesResult> {
  let res: Response;
  try {
    res = await apiFetch('/api/industries');
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const industries = (await res.json()) as IndustryListItem[];
  return { status: 'ok', industries };
}

export async function fetchIndustryPack(slug: string): Promise<FetchIndustryPackResult> {
  let res: Response;
  try {
    res = await apiFetch(`/api/industries/${encodeURIComponent(slug)}/pack`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  const body = await res.json().catch(() => null);

  if (res.status === 404) {
    return { status: 'not_found', message: body?.message ?? `industry '${slug}' not found` };
  }
  if (!res.ok) {
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  return { status: 'ok', pack: body as IndustryPack };
}
