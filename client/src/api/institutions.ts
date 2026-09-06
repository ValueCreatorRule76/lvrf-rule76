// GET /api/institutions — snake_case, exactly the columns
// institutionsIndex.ts selects. Flat and unscoped, same shape as
// runsIndex.ts's fetchRuns — no actor header, no params.

export interface InstitutionListItem {
  id: string;
  name: string;
  /** null when unclassified — an absent fact, not a placeholder string. */
  industry_name: string | null;
  engagement_count: number;
}

export type FetchInstitutionsResult =
  | { status: 'ok'; institutions: InstitutionListItem[] }
  | { status: 'error'; message: string };

export async function fetchInstitutions(): Promise<FetchInstitutionsResult> {
  let res: Response;
  try {
    res = await fetch('/api/institutions');
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const institutions = (await res.json()) as InstitutionListItem[];
  return { status: 'ok', institutions };
}
