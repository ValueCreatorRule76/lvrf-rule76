import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { isUuid } from '../routes/params.js';
import type { ActorHeaderMode } from './actorHeader.js';

/**
 * Sign-in sessions (0027). Shared by routes/auth.ts (P1) and by
 * requireActor (P2), which makes the session the actor.
 *
 * The browser holds a random 32-byte token in an HttpOnly cookie; the
 * database holds only its SHA-256 (sessions.token_hash), so a read of the
 * sessions table cannot be replayed as a login.
 */

export const SESSION_COOKIE = 'lvrf_session';
/** Sliding: a session unused for this long expires. */
export const IDLE_HOURS = 12;
/** Absolute: no session outlives this, however active. */
export const ABSOLUTE_DAYS = 7;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Minimal cookie parse — one header, no dependency. */
export function readSessionToken(req: Request): string | null {
  const header = req.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value === '' ? null : decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Secure only over HTTPS. Behind Caddy the API sees plain HTTP from
 * 127.0.0.1 with X-Forwarded-Proto: https, so that header decides; local
 * development over http://localhost gets a non-Secure cookie it can use.
 */
function isHttps(req: Request): boolean {
  return req.secure || req.get('x-forwarded-proto') === 'https';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ABSOLUTE_DAYS * 24 * 60 * 60}`,
  ];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export interface SessionPerson {
  session_id: string;
  person_id: string;
  full_name: string;
  email: string;
  tenant_id: string;
  /** 0029: the current credential is a starting password (grant/reset). */
  must_change: boolean;
}

/** Don't rewrite last_seen_at / expires_at more often than this (P2a). */
const REFRESH_EVERY_SECONDS = 60;

/**
 * The signed-in person for this request, or null. A session counts only
 * if it is not revoked, not past expires_at or absolute_expires_at, and
 * its person is still current vendor staff (tenant-scoped, not simulated,
 * not retired or superseded) — revoking a person's standing revokes their
 * sessions without touching the sessions table.
 *
 * On success it slides expires_at forward (never past the absolute cap)
 * and stamps last_seen_at — at most once a minute (P2a: every API request
 * now resolves the session, and an UPDATE per request is churn with no
 * information in it). Those writes run on the pool, outside any request
 * transaction, because a sign-in's freshness is not part of the write the
 * request is making.
 */
export async function resolveSession(pool: Pool, req: Request): Promise<SessionPerson | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows: [row] } = await pool.query<SessionPerson & { stale: boolean }>(
    `SELECT s.id AS session_id, p.id AS person_id, p.full_name, p.email, p.tenant_id,
            c.must_change,
            s.last_seen_at < now() - make_interval(secs => $2) AS stale
       FROM sessions s
       JOIN persons p ON p.id = s.person_id
       -- Band A: a session stands on a current credential. Revoking the
       -- credential (revoke_access, reset_password) ends it even before
       -- its own revoked_at is written, and the credential says whether
       -- the password is a starting one (must_change).
       JOIN person_credentials c ON c.person_id = p.id AND c.revoked_at IS NULL
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.absolute_expires_at > now()
        AND p.tenant_id IS NOT NULL
        AND p.simulated = false
        AND p.deleted_at IS NULL
        AND p.superseded_by_id IS NULL`,
    [tokenHash, REFRESH_EVERY_SECONDS],
  );
  if (!row) return null;
  if (row.stale) {
    await pool.query(
      `UPDATE sessions
          SET last_seen_at = now(),
              expires_at = LEAST(now() + make_interval(hours => $2), absolute_expires_at)
        WHERE id = $1 AND revoked_at IS NULL`,
      [row.session_id, IDLE_HOURS],
    );
  }
  const { stale: _stale, ...person } = row;
  return person;
}

/**
 * Who is making this request (P2a). Set on req.actor by requireActor for
 * every /api route except /api/health and /api/auth/*.
 */
export interface Actor {
  personId: string;
  tenantId: string;
  fullName: string;
  /** How the actor was established — a session, or (scripts only) the header. */
  via: 'session' | 'header';
  /**
   * Band A: the session's password is a starting one. requireActor then
   * answers 403 password_change_required on every route past it; only
   * /api/auth/me, /change-password and /logout (mounted before it) work.
   */
  mustChange: boolean;
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/**
 * The actor for this request, or null.
 *
 *   1. A valid session cookie. If present, it is the actor, and any
 *      X-Actor-Person-Id header is ignored — a signed-in tab cannot be
 *      steered by a header.
 *   2. Otherwise the X-Actor-Person-Id header, ONLY when headerMode is
 *      'on' — LVRF_ALLOW_ACTOR_HEADER=1 outside production, for the verify
 *      scripts (lib/actorHeader.ts). Off, the header is never read: a
 *      request carrying it and no session is a 401 like any other.
 *
 * Either way the actor must be CURRENT, NON-SIMULATED VENDOR STAFF.
 * Customer-side people are subjects of the record and can be named in a
 * request body (committed_by, verified_by, attested_by, confirmed_by,
 * owner) — chosen values, validated against the account's institution —
 * but they do not act. Checked against prod before P2a: no customer-side
 * or simulated person has ever been the actor on an audit_log row.
 */
export async function resolveActor(pool: Pool, req: Request, headerMode: ActorHeaderMode): Promise<Actor | null> {
  const session = await resolveSession(pool, req);
  if (session) {
    return {
      personId: session.person_id, tenantId: session.tenant_id, fullName: session.full_name,
      via: 'session', mustChange: session.must_change,
    };
  }
  if (headerMode !== 'on') return null;
  const header = req.get('x-actor-person-id');
  if (!header || !isUuid(header)) return null;
  const { rows: [p] } = await pool.query<{ id: string; tenant_id: string; full_name: string }>(
    `SELECT id, tenant_id, full_name FROM persons
      WHERE id = $1 AND tenant_id IS NOT NULL AND simulated = false
        AND deleted_at IS NULL AND superseded_by_id IS NULL`,
    [header],
  );
  return p ? { personId: p.id, tenantId: p.tenant_id, fullName: p.full_name, via: 'header', mustChange: false } : null;
}
