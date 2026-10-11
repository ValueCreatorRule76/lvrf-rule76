/**
 * Sign-in P2a: the one way the client talks to the API.
 *
 * The session lives in an HttpOnly cookie the server sets; this page never
 * sees the token. Same-origin fetches send that cookie, so nothing here
 * adds an actor — the X-Actor-Person-Id header is no longer sent by the
 * client at all.
 *
 * A 401 from any API call except the sign-in routes themselves means the
 * session has ended (expired, revoked, signed out elsewhere). It is
 * announced once, as a window event, and AuthProvider (actor/ActorContext)
 * opens the sign-in panel over the current page — the page stays mounted,
 * so a half-filled form keeps its fields. The request that got the 401 did
 * nothing on the server (the actor is resolved before any transaction
 * opens) and is never replayed automatically: a governed write is
 * resubmitted by a person, deliberately.
 */

export const UNAUTHORIZED_EVENT = 'lvrf:unauthorized';
/**
 * Band A: the server answers 403 password_change_required while the
 * signed-in person still holds a starting password. Announced once, like a
 * 401; the auth provider then shows the change-password page.
 */
export const PASSWORD_CHANGE_EVENT = 'lvrf:password-change-required';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, credentials: 'same-origin' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body && (body as { code?: string }).code === 'password_change_required') {
      window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
    }
  }
  return res;
}
