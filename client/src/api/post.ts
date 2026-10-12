/**
 * The first POST helper in the client. Every call before this one is a GET;
 * there is no shared wrapper to extend, so this establishes the pattern for
 * every governed write to come.
 *
 * A GOVERNANCE REFUSAL IS NOT AN ERROR. A 422 from this API carries a
 * message naming an amendment and the reason a write was refused — that is
 * the system working, not failing. A 409 is a conflict with existing state,
 * named the same way. A network failure, a dropped connection, or a 500 is
 * the system failing. PostResult keeps 'refused' and 'conflict' distinct
 * from 'error' so a caller cannot collapse them into one rendering —
 * flattening a refusal into a generic error would undo the argument the
 * product makes.
 */

import { apiFetch } from './http';

export type PostResult<T> =
  | { status: 'ok'; data: T }
  /** issues: every problem a 422 named (Q4c1), when the route sends a list — e.g. a parse refused wholesale. */
  | { status: 'refused'; message: string; issues?: string[] }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string };

// Sign-in P2a: the actor is the signed-in person, carried by the session
// cookie — there is no actor argument and no header. A write with no
// session is refused by the server (401) before any transaction opens, so
// it saved nothing; apiFetch announces the 401 and the sign-in panel opens
// over the page. The write is never replayed: the person submits again.
export async function postGoverned<T>(path: string, body: unknown): Promise<PostResult<T>> {
  let res: Response;
  try {
    // Content-Type: application/json on every write — the server refuses
    // anything else (415, server/lib/origin.ts).
    res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  // A proxy error page or any other non-JSON body must not throw here —
  // it surfaces as 'error' with a fallback message, same as runs.ts.
  const parsed = await res.json().catch(() => null);

  if (res.status === 401) {
    return {
      status: 'error',
      message: 'Your sign-in has ended, so nothing was saved. Sign in again and submit once more.',
    };
  }
  if (res.status === 422) {
    // err.message exactly as the server sent it — never prefixed, wrapped,
    // appended, or mapped to a friendlier string. That sentence is the
    // product.
    const issues = Array.isArray(parsed?.issues) ? (parsed.issues as unknown[]).filter((i): i is string => typeof i === 'string') : undefined;
    return { status: 'refused', message: parsed?.message ?? `HTTP ${res.status}`, ...(issues && issues.length > 0 ? { issues } : {}) };
  }
  if (res.status === 409) {
    return { status: 'conflict', message: parsed?.message ?? `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { status: 'error', message: parsed?.message ?? `HTTP ${res.status}` };
  }

  return { status: 'ok', data: parsed as T };
}
