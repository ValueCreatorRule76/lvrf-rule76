// GET /api/cohort — snake_case, exactly the shape server/routes/cohort.ts
// returns. Tenant-scoped by the signed-in actor (sign-in P2a): the session
// cookie carries it, so there is no actor argument.

import { apiFetch } from './http';

export type CohortMemberStatus = 'run_of_record' | 'no_locked_run' | 'never_run' | 'no_engagement';

export interface CohortMember {
  institution_id: string;
  institution_name: string;
  engagement_id: string | null;
  engagement_name: string | null;
  status: CohortMemberStatus;
  /** Internal ordering key, never a score — 0 for unmeasured. Do not render it. */
  sort_key: number;
  run_id: string | null;
  run_number: number | null;
  confidence_score: string | null;
  confidence_band: string | null;
  locked_at: string | null;
  model_version: string | null;
  model_fingerprint: string | null;
  run_count: number;
  /** C3: the run of record's current errata, in a line; null if none. */
  erratum_line: string | null;
}

export interface Cohort {
  account_count: number;
  member_count: number;
  measured_count: number;
  composite: {
    /** As stored (pg numeric string). Null when the floor is unmeasured or the cohort is empty. */
    score: string | null;
    band: string | null;
    floor: 'run' | 'unmeasured' | 'empty';
    determined_by: CohortMember | null;
    /** Context only, never the cohort's score. */
    lowest_recorded: {
      confidence_score: string;
      confidence_band: string | null;
      member: CohortMember;
    } | null;
  };
  members: CohortMember[];
  model: {
    fingerprints: { model_version: string | null; model_fingerprint: string | null; run_count: number }[];
    comparable: boolean;
    note: string;
  };
}

export interface CohortView {
  book: Cohort;
  by_industry: { industry: { slug: string; name: string }; cohort: Cohort }[];
  unclassified_account_count: number;
  /** Q4n: accounts left out of every cohort because they are current reference examples (O-D3). */
  reference_example_count: number;
}

export type FetchCohortResult =
  | { status: 'ok'; view: CohortView }
  | { status: 'error'; message: string };

export async function fetchCohort(): Promise<FetchCohortResult> {
  let res: Response;
  try {
    res = await apiFetch('/api/cohort');
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  return { status: 'ok', view: body as CohortView };
}
