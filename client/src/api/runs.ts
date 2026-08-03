import type { Run } from '../types/run';

export type FetchRunResult =
  | { status: 'ok'; run: Run }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

export async function fetchRun(id: string): Promise<FetchRunResult> {
  let res: Response;
  try {
    res = await fetch(`/api/runs/${id}`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const run = (await res.json()) as Run;
  return { status: 'ok', run };
}
