// Shape of GET /api/engagements/:id/runs — one row per value_run on this
// engagement, snake_case, exactly the columns that route selects.

export interface EngagementRun {
  id: string;
  run_number: number;
  terminal_value_stage: string;
  confidence_score: string;
  confidence_band: string;
  institutional_health: string | null;
  health_band: string | null;
  health_coverage_pct: number | null;
  locked_at: string | null;
  source_fixture: string | null;
  walked_at: string;
}

export type FetchEngagementRunsResult =
  | { status: 'ok'; runs: EngagementRun[] }
  | { status: 'error'; message: string };

export async function fetchEngagementRuns(engagementId: string): Promise<FetchEngagementRunsResult> {
  let res: Response;
  try {
    res = await fetch(`/api/engagements/${engagementId}/runs`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const runs = (await res.json()) as EngagementRun[];
  return { status: 'ok', runs };
}
