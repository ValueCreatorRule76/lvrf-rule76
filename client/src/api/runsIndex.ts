import type { RunListItem } from '../types/runsIndex';

export type FetchRunsResult =
  | { status: 'ok'; runs: RunListItem[] }
  | { status: 'error'; message: string };

export async function fetchRuns(): Promise<FetchRunsResult> {
  let res: Response;
  try {
    res = await fetch('/api/runs');
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const runs = (await res.json()) as RunListItem[];
  return { status: 'ok', runs };
}
