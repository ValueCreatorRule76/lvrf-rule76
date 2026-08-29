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

export type PostResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'refused'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function postGoverned<T>(
  path: string,
  body: unknown,
  actorPersonId: string,
): Promise<PostResult<T>> {
  // A write with no actor is refused by the server anyway — actorContext
  // requires X-Actor-Person-Id on every mutating request. Failing here
  // makes the reason legible instead of arriving as a generic 422 from a
  // request that was never going to succeed. actorPersonId is a required
  // argument on purpose: no module-level constant, no localStorage, no
  // ambient default — that hidden default is the exact hole the server
  // middleware was fixed to close, and this helper must not reopen it.
  if (!UUID_RE.test(actorPersonId)) {
    return {
      status: 'error',
      message: `actorPersonId must be a valid UUID, got: ${actorPersonId || '(empty)'}`,
    };
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Actor-Person-Id': actorPersonId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }

  // A proxy error page or any other non-JSON body must not throw here —
  // it surfaces as 'error' with a fallback message, same as runs.ts.
  const parsed = await res.json().catch(() => null);

  if (res.status === 422) {
    // err.message exactly as the server sent it — never prefixed, wrapped,
    // appended, or mapped to a friendlier string. That sentence is the
    // product.
    return { status: 'refused', message: parsed?.message ?? `HTTP ${res.status}` };
  }
  if (res.status === 409) {
    return { status: 'conflict', message: parsed?.message ?? `HTTP ${res.status}` };
  }
  if (!res.ok) {
    return { status: 'error', message: parsed?.message ?? `HTTP ${res.status}` };
  }

  return { status: 'ok', data: parsed as T };
}
