import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';

/**
 * Sign-in sessions (0027). Shared by routes/auth.ts (P1) and, from P2, by
 * the middleware that replaces the X-Actor-Person-Id header.
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
}

/**
 * The signed-in person for this request, or null. A session counts only
 * if it is not revoked, not past expires_at or absolute_expires_at, and
 * its person is still current vendor staff (tenant-scoped, not simulated,
 * not retired or superseded) — revoking a person's standing revokes their
 * sessions without touching the sessions table.
 *
 * On success it slides expires_at forward (never past the absolute cap)
 * and stamps last_seen_at. That UPDATE runs on the pool, outside any
 * request transaction, because a sign-in's freshness is not part of the
 * write the request is making.
 */
export async function resolveSession(pool: Pool, req: Request): Promise<SessionPerson | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const { rows: [row] } = await pool.query<SessionPerson>(
    `UPDATE sessions s
        SET last_seen_at = now(),
            expires_at = LEAST(now() + make_interval(hours => $2), s.absolute_expires_at)
       FROM persons p
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.absolute_expires_at > now()
        AND p.id = s.person_id
        AND p.tenant_id IS NOT NULL
        AND p.simulated = false
        AND p.deleted_at IS NULL
        AND p.superseded_by_id IS NULL
      RETURNING s.id AS session_id, p.id AS person_id, p.full_name, p.email, p.tenant_id`,
    [hashToken(token), IDLE_HOURS],
  );
  return row ?? null;
}
