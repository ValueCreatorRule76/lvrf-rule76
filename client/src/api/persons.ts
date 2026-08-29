// Shape of GET /api/persons — one row per person, snake_case, exactly the
// columns that route selects. institution_id/institution_name are null for
// a person with no institution (vendor staff) — see server/routes/persons.ts.

export interface Person {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  institution_id: string | null;
  institution_name: string | null;
  simulated: boolean;
}

export type FetchPersonsResult =
  | { status: 'ok'; persons: Person[] }
  | { status: 'error'; message: string };

export async function fetchPersons(
  opts: { institutionId?: string; includeSimulated?: boolean } = {},
): Promise<FetchPersonsResult> {
  const params = new URLSearchParams();
  if (opts.institutionId) params.set('institution_id', opts.institutionId);
  if (opts.includeSimulated) params.set('include_simulated', 'true');
  const qs = params.toString();

  let res: Response;
  try {
    res = await fetch(`/api/persons${qs ? `?${qs}` : ''}`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const persons = (await res.json()) as Person[];
  return { status: 'ok', persons };
}
