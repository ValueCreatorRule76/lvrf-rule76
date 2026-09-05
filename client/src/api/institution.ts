// GET /api/institutions/:id/view — snake_case, exactly the shape that
// route assembles. Tenant-scoped by the actor, same reasoning as
// packs.ts's fetchIndustryPack: no module-level actor default, so
// actorPersonId is a required argument here too.

export interface InstitutionViewInstitution {
  id: string;
  name: string;
  /** What was stated at intake. Never overwritten by classification. */
  industry: string | null;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  is_tenant_self: boolean;
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
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  source_system: string;
  industry_measure_id: string | null;
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
  /** NULL when unclassified — there is no pack to look up. [] is a real, classified, empty pack. */
  pack: InstitutionPackMeasure[] | null;
  metrics: InstitutionBusinessMetric[];
  engagements: InstitutionEngagement[];
  runs: InstitutionRunsSummary;
}

export type FetchInstitutionViewResult =
  | { status: 'ok'; view: InstitutionView }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchInstitutionView(
  institutionId: string,
  actorPersonId: string,
): Promise<FetchInstitutionViewResult> {
  let res: Response;
  try {
    res = await fetch(`/api/institutions/${encodeURIComponent(institutionId)}/view`, {
      headers: { 'X-Actor-Person-Id': actorPersonId },
    });
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
