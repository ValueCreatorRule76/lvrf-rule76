// Shape of GET /api/value-outcomes/:id/gaps — one row per unearned or
// partially-earned confidence factor, snake_case, exactly what
// server/routes/gapRegister.ts returns. Typed from that route, not inferred
// from a description — see its own comment on why state and path are two
// independent fields, not one three-value field.

import type { ConfidenceFactorKey } from '../types/run';

export type AskType = 'definition' | 'document' | 'person';

// state: a fact about HISTORY — has an attempt on this factor been made and
// rejected? path: a fact about the PRESENT — would further effort on the
// current source ever close this factor? The two are independent; see
// gapRegister.ts's GapState/GapPath comment for the four reachable
// combinations and why refused+blocked is the one worth stopping on.
export type GapState = 'open' | 'refused';
export type GapPath = 'viable' | 'blocked';

export interface PersonOnRecord {
  id: string;
  full_name: string;
}

export interface GapEntry {
  factor: ConfidenceFactorKey;
  question: string;
  weight: number;
  earned: number;
  gap: string;
  ask_type: AskType;
  requirement: string;
  earns: number;
  state: GapState;
  path: GapPath;
  refusal_message: string | null;
  refused_at: string | null;
  // Present only when ask_type is 'person' — gapRegister.ts's own spread
  // condition. Absent (not an empty array) on every other ask_type.
  persons_on_record?: PersonOnRecord[];
}

export type FetchGapsResult =
  | { status: 'ok'; gaps: GapEntry[] }
  | { status: 'error'; message: string };

export async function fetchGaps(outcomeId: string): Promise<FetchGapsResult> {
  let res: Response;
  try {
    res = await fetch(`/api/value-outcomes/${outcomeId}/gaps`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }

  const gaps = (await res.json()) as GapEntry[];
  return { status: 'ok', gaps };
}
