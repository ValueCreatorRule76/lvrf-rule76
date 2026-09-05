// GET /api/industries and GET /api/industries/:slug/pack — snake_case,
// exactly the columns those routes select (same convention as
// types/runsIndex.ts's RunListItem).
//
// Both endpoints are tenant-scoped by the actor, so both take
// actorPersonId as a required argument — no module-level constant, no
// ambient default, same reasoning as post.ts's postGoverned: a hidden
// default actor is the exact hole ActorContext's "no persistence" design
// exists to close, and a read must not reopen it any more than a write may.

export interface IndustryListItem {
  id: string;
  name: string;
  slug: string;
  measure_count: number;
}

export interface IndustryMeasure {
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
}

export interface IndustryPack {
  industry: { id: string; name: string; slug: string };
  measures: IndustryMeasure[];
}

export type FetchIndustriesResult =
  | { status: 'ok'; industries: IndustryListItem[] }
  | { status: 'error'; message: string };

export type FetchIndustryPackResult =
  | { status: 'ok'; pack: IndustryPack }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchIndustries(actorPersonId: string): Promise<FetchIndustriesResult> {
  let res: Response;
  try {
    res = await fetch('/api/industries', {
      headers: { 'X-Actor-Person-Id': actorPersonId },
    });
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

export async function fetchIndustryPack(
  slug: string,
  actorPersonId: string,
): Promise<FetchIndustryPackResult> {
  let res: Response;
  try {
    res = await fetch(`/api/industries/${encodeURIComponent(slug)}/pack`, {
      headers: { 'X-Actor-Person-Id': actorPersonId },
    });
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
