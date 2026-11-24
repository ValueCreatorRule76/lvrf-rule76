import { apiFetch } from './http';
import type { Cohort, CohortMember } from './cohort';

/**
 * S6 (LVRF_PLAN §25): GET /api/book, the War Room's read. NO MONEY in it, anywhere (D1): counts, dates and states only.
 * A row's cost of delay is its state, never its figure.
 */
/** §28 D5 (Brad, 24 Nov 2026): "late" is Anywhere on Earth, said wherever late shows. */
export const LATE_RULE = 'late: the promised day has ended everywhere';

export interface HypothesisTally { due: { in30: number; in60: number; in90: number }; past_due_open: number; open: number; confirmed: number; refuted: number }
export interface OutcomeTally { total: number; late: number; no_promised_date: number; by_status: Record<string, number> }
export interface BookOutcome { id: string; realization: string; promised_on: string | null; measured_on: string | null; late: boolean }
export interface BookAccount {
  institution_id: string;
  hypotheses: HypothesisTally;
  outcomes: OutcomeTally & { list: BookOutcome[] };
  cost_of_delay_by_run: { run_id: string; state: 'stated' | 'refused' | 'not_sealed'; reasons: string[] }[];
}
export interface Book {
  as_of: string;
  book: {
    account_count: number;
    confidence: Cohort['composite'];
    hypotheses: HypothesisTally;
    outcomes: OutcomeTally;
    confirmation_gap: { admissible: number; needs: number; reported: boolean; dispersion_needs: number };
  };
  accounts: BookAccount[];
  by_industry: { industry: { slug: string; name: string }; cohort: Cohort }[];
  cohort_members: CohortMember[];
  not_in_book: { institution_id: string; name: string; reason: 'own_account' | 'reference_example'; marker_kind: string | null }[];
}

export type FetchBookResult = { status: 'ok'; book: Book } | { status: 'error'; message: string };

export async function fetchBook(): Promise<FetchBookResult> {
  try {
    const r = await apiFetch('/api/book');
    if (!r.ok) return { status: 'error', message: "Couldn't load the book." };
    return { status: 'ok', book: (await r.json()) as Book };
  } catch {
    return { status: 'error', message: "Couldn't load the book." };
  }
}

/** "1 in 30 days · 1 in 60 · 1 in 90", in words (Brad, 20 Nov 2026): the headline tile and the Accounts band. */
export function dueInWords(d: HypothesisTally['due']): string {
  return `${d.in30} in 30 days · ${d.in60} in 60 · ${d.in90} in 90`;
}
