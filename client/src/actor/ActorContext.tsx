import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PASSWORD_CHANGE_EVENT, UNAUTHORIZED_EVENT } from '../api/http';

/**
 * Sign-in P2a: the actor is the SIGNED-IN PERSON. There is no picker.
 *
 * The session is a cookie the server sets (HttpOnly — this code never sees
 * it). On load the provider asks /api/auth/me who is signed in; nothing is
 * kept in localStorage or sessionStorage — the server's session is the only
 * state, so a refresh asks again rather than trusting a cached name.
 *
 * Kept under the old names (ActorProvider, useActor, actor) so every
 * component that gated on "is there an actor?" still reads the same way:
 * `actor` is now the signed-in person, or null.
 *
 * STATUS:
 *   loading      — asking /api/auth/me
 *   signed_out   — no session; App shows the sign-in page
 *   signed_in    — `actor` is set
 *   expired      — a session that WAS signed in got a 401 mid-task. App
 *                  keeps the page mounted (a half-filled form keeps its
 *                  fields) and overlays the sign-in panel. Nothing is
 *                  replayed after signing in again: the person resubmits.
 */

export interface Actor {
  id: string;
  full_name: string;
  email: string;
  /** Vendor staff have no institution; kept for the components that render it. */
  institution_name: null;
  /**
   * Band A item 2: this person is their tenant's steward — the acts that
   * are Brad's alone are theirs. steward_name names whoever is. A control
   * for a steward-only act (none exists in the client today) must be
   * disabled, with steward_name, when is_steward is false; the server
   * refuses it anyway (403 steward_only).
   */
  is_steward: boolean;
  steward_name: string | null;
}

/**
 * must_change (Band A): signed in on a starting password; the app shows only
 * the change-password page until it is replaced.
 */
export type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'expired' | 'must_change';

export type SignInResult = { ok: true } | { ok: false; message: string };
export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

interface ActorContextValue {
  actor: Actor | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<ChangePasswordResult>;
}

const ActorContext = createContext<ActorContextValue | null>(null);

interface MePerson {
  id: string;
  full_name: string;
  email: string;
  must_change?: boolean;
  is_steward?: boolean;
  steward_name?: string | null;
}

function toActor(p: MePerson): Actor {
  return {
    id: p.id, full_name: p.full_name, email: p.email, institution_name: null,
    is_steward: p.is_steward === true, steward_name: p.steward_name ?? null,
  };
}

export function ActorProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { person: MePerson };
          setActor(toActor(body.person));
          setStatus(body.person.must_change ? 'must_change' : 'signed_in');
        } else {
          setStatus('signed_out');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('signed_out');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API 401 (apiFetch) ends the session in this tab. A tab that was
  // signed in becomes 'expired' — the page stays, the panel opens.
  useEffect(() => {
    const onUnauthorized = () => {
      setStatus((s) => (s === 'signed_in' ? 'expired' : s === 'loading' ? 'signed_out' : s));
    };
    const onMustChange = () => setStatus((s) => (s === 'signed_in' ? 'must_change' : s));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    window.addEventListener(PASSWORD_CHANGE_EVENT, onMustChange);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
      window.removeEventListener(PASSWORD_CHANGE_EVENT, onMustChange);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    let res: Response;
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network error' };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // The server's own words: one message for every failed sign-in, and
      // its own message for 429 — never mapped to a friendlier string.
      return { ok: false, message: body?.message ?? `HTTP ${res.status}` };
    }
    const person = (body as { person: MePerson }).person;
    setActor(toActor(person));
    setStatus(person.must_change ? 'must_change' : 'signed_in');
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    // JSON, like every write — the server refuses anything else (415).
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
    setActor(null);
    setStatus('signed_out');
  }, []);

  // `actor` stays set while 'expired', on purpose: pages that render a
  // placeholder when there is no actor would otherwise unmount, and a
  // half-filled form would lose its fields. The sign-in panel covers the
  // page meanwhile, and any write that slips through gets a 401 anyway.
  const changePassword = useCallback(async (current: string, next: string): Promise<ChangePasswordResult> => {
    let res: Response;
    try {
      res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network error' };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: body?.message ?? `HTTP ${res.status}` };
    setStatus('signed_in');
    return { ok: true };
  }, []);

  const value = useMemo<ActorContextValue>(
    () => ({
      actor: status === 'signed_in' || status === 'expired' || status === 'must_change' ? actor : null,
      status,
      signIn,
      signOut,
      changePassword,
    }),
    [actor, status, signIn, signOut, changePassword],
  );

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor(): ActorContextValue {
  const ctx = useContext(ActorContext);
  if (!ctx) {
    throw new Error('useActor must be used within an ActorProvider');
  }
  return ctx;
}
