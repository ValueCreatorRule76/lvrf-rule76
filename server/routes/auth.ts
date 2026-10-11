import { Router, type Request } from 'express';
import type { Pool } from 'pg';
import argon2 from 'argon2';
import {
  ABSOLUTE_DAYS, IDLE_HOURS, clearSessionCookie, hashToken, newToken,
  readSessionToken, resolveSession, setSessionCookie,
} from '../lib/session.js';

/**
 * Sign-in, phase P1 (0027): POST /api/auth/login, POST /api/auth/logout,
 * GET /api/auth/me.
 *
 * MOUNTED BEFORE actorContext (server/index.ts). Signing in is how a
 * person becomes an actor, so it cannot require an actor header. These
 * routes write sessions on the pool directly — a session row is not a
 * governed write, carries no actor, and is not audited (see db/schema.ts).
 *
 * P1 IS ADDITIVE. Nothing else reads the session yet; the
 * X-Actor-Person-Id header still decides the actor everywhere. P2 makes
 * the session the actor and refuses the header in production.
 *
 * WHO CAN SIGN IN: vendor staff only — a current, non-simulated person
 * with a tenant_id, a current credential and (Band A, deploy B) a current
 * access grant. Customer-side persons are
 * subjects of the record, not users. Every failure, whatever its cause
 * (unknown email, customer-side person, no credential, wrong password),
 * gets the same 401 and the same message, and an argon2 verify runs even
 * when there is no hash to check, so neither the answer nor its timing
 * says which.
 *
 * FORGERY: login and logout require Content-Type: application/json; a
 * cross-site form cannot send that without a preflight, and the cookie is
 * SameSite=Lax besides.
 *
 * RATE LIMIT: 5 failed attempts per (IP, email) per 15 minutes, in memory.
 * In memory means it resets on restart and is per-process; with one
 * process on one box that is acceptable for P1, and stated rather than
 * implied.
 *
 * BOUNDED. A key is created only by a FAILED attempt, its list never holds
 * more than FAIL_LIMIT timestamps (attempts past the limit are refused
 * before anything is recorded), expired keys are removed on read and swept
 * every window, and the map is capped at MAX_KEYS — past the cap the
 * oldest keys are evicted. Under a flood of more than MAX_KEYS distinct
 * (IP, email) pairs, eviction can reset an older key's count early; that
 * is the stated price of a bound, and a flood that size is a network-level
 * problem, not one this map should try to absorb.
 */

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;
const failures = new Map<string, number[]>();

// A real argon2id hash of a random string, computed once, so a login for
// an unknown email still spends one verify.
const dummyHashPromise = argon2.hash(newToken(), { type: argon2.argon2id });

function failureKey(req: Request, email: string): string {
  return `${req.ip ?? 'unknown'}|${email.toLowerCase()}`;
}

/** Failures inside the window. Reading never creates a key, and drops an expired one. */
function recentFailures(key: string): number {
  const list = failures.get(key);
  if (!list) return 0;
  const now = Date.now();
  const kept = list.filter((t) => now - t < FAIL_WINDOW_MS);
  if (kept.length === 0) failures.delete(key);
  else failures.set(key, kept);
  return kept.length;
}

function pruneFailures(now: number): void {
  for (const [k, list] of failures) {
    if (list.every((t) => now - t >= FAIL_WINDOW_MS)) failures.delete(k);
  }
  // Map iterates in insertion order and recordFailure re-inserts a key on
  // every failure, so the first keys are the least recently failed.
  while (failures.size > MAX_KEYS) {
    const oldest = failures.keys().next().value;
    if (oldest === undefined) break;
    failures.delete(oldest);
  }
}

function recordFailure(key: string): void {
  const now = Date.now();
  const kept = (failures.get(key) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  kept.push(now);
  failures.delete(key);
  failures.set(key, kept);
  if (failures.size > MAX_KEYS) pruneFailures(now);
}

// A sweep every window, so idle keys do not wait for the cap to be reached.
// unref(): the timer never keeps the process alive on its own.
setInterval(() => pruneFailures(Date.now()), FAIL_WINDOW_MS).unref();

const BAD_LOGIN = 'Email or password is incorrect.';
const MIN_PASSWORD_LENGTH = 12;

export function authRouter(pool: Pool): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Content-Type must be application/json.' });
        return;
      }
      const body = req.body as Record<string, unknown> | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (email === '' || password === '') {
        res.status(422).json({ message: 'Email and password are required.' });
        return;
      }

      const key = failureKey(req, email);
      if (recentFailures(key) >= FAIL_LIMIT) {
        res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
        return;
      }

      const { rows: candidates } = await pool.query<{
        person_id: string; full_name: string; email: string; tenant_id: string; password_hash: string;
        must_change: boolean;
      }>(
        `SELECT p.id AS person_id, p.full_name, p.email, p.tenant_id, c.password_hash, c.must_change
           FROM persons p
           JOIN person_credentials c ON c.person_id = p.id AND c.revoked_at IS NULL
          WHERE lower(p.email) = lower($1)
            AND p.tenant_id IS NOT NULL
            AND p.simulated = false
            AND p.deleted_at IS NULL
            AND p.superseded_by_id IS NULL
            -- Band A deploy B: sign-in needs a current access grant as
            -- well as a current credential. No grant is the same 401 and
            -- the same message as a wrong password.
            AND EXISTS (SELECT 1 FROM access_grants g WHERE g.person_id = p.id AND g.revoked_at IS NULL)`,
        [email],
      );
      // Exactly one, or nobody. persons.email is UNIQUE case-sensitively but
      // matched here case-insensitively, so two people whose emails differ
      // only by case could both match; that is refused through the same
      // uniform failure path rather than picking one of them.
      const candidate = candidates.length === 1 ? candidates[0] : undefined;

      const hash = candidate?.password_hash ?? (await dummyHashPromise);
      const passwordOk = await argon2.verify(hash, password);
      if (!candidate || !passwordOk) {
        recordFailure(key);
        res.status(401).json({ message: BAD_LOGIN });
        return;
      }
      failures.delete(key);

      const token = newToken();
      await pool.query(
        `INSERT INTO sessions (token_hash, person_id, expires_at, absolute_expires_at, user_agent)
         VALUES ($1, $2, now() + make_interval(hours => $3), now() + make_interval(days => $4), $5)`,
        [hashToken(token), candidate.person_id, IDLE_HOURS, ABSOLUTE_DAYS, req.get('user-agent') ?? null],
      );
      setSessionCookie(req, res, token);
      const { rows: [steward] } = await pool.query<{ id: string; full_name: string }>(
        'SELECT p.id, p.full_name FROM tenants t JOIN persons p ON p.id = t.steward_person_id WHERE t.id = $1',
        [candidate.tenant_id],
      );
      res.status(200).json({
        person: {
          id: candidate.person_id,
          full_name: candidate.full_name,
          email: candidate.email,
          tenant_id: candidate.tenant_id,
          must_change: candidate.must_change,
          is_steward: steward?.id === candidate.person_id,
          steward_name: steward?.full_name ?? null,
        },
      });
    } catch (err) {
      console.error('LVRF: login failed with a server error.', err);
      res.status(500).json({ message: 'Sign-in failed with a server error.' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Content-Type must be application/json.' });
        return;
      }
      const token = readSessionToken(req);
      if (token) {
        await pool.query(
          'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
          [hashToken(token)],
        );
      }
      clearSessionCookie(req, res);
      res.status(200).json({ signed_out: true });
    } catch (err) {
      console.error('LVRF: logout failed with a server error.', err);
      res.status(500).json({ message: 'Sign-out failed with a server error.' });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const person = await resolveSession(pool, req);
      if (!person) {
        res.status(401).json({ message: 'Not signed in.' });
        return;
      }
      // Band A item 2: whether this person is their tenant's steward, and
      // who the steward is — so the client can disable the steward's
      // controls and say whose act it is. The server stays the authority
      // (requireSteward).
      const { rows: [steward] } = await pool.query<{ id: string; full_name: string }>(
        'SELECT p.id, p.full_name FROM tenants t JOIN persons p ON p.id = t.steward_person_id WHERE t.id = $1',
        [person.tenant_id],
      );
      res.status(200).json({
        person: {
          id: person.person_id,
          full_name: person.full_name,
          email: person.email,
          tenant_id: person.tenant_id,
          must_change: person.must_change,
          is_steward: steward?.id === person.person_id,
          steward_name: steward?.full_name ?? null,
        },
      });
    } catch (err) {
      console.error('LVRF: session lookup failed with a server error.', err);
      res.status(500).json({ message: 'Session lookup failed with a server error.' });
    }
  });

  // Band A item 1. The signed-in person replaces their own password: the
  // starting password a grant or reset gave them (must_change), or any
  // time. The current password is required and throttled like sign-in. In
  // one transaction the old credential is revoked, the new one inserted
  // (set_via 'self', must_change false), and every OTHER session of the
  // person ends — this one stays signed in. person_credentials is not
  // audited (P1); its rows are the record.
  router.post('/change-password', async (req, res) => {
    try {
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Content-Type must be application/json.' });
        return;
      }
      const person = await resolveSession(pool, req);
      if (!person) {
        res.status(401).json({ message: 'Sign in to continue.' });
        return;
      }
      const body = req.body as Record<string, unknown> | undefined;
      const current = typeof body?.current_password === 'string' ? body.current_password : '';
      const next = typeof body?.new_password === 'string' ? body.new_password : '';
      if (current === '' || next === '') {
        res.status(422).json({ message: 'The current and the new password are both required.' });
        return;
      }
      const key = failureKey(req, person.email);
      if (recentFailures(key) >= FAIL_LIMIT) {
        res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
        return;
      }
      const { rows: [cred] } = await pool.query<{ id: string; password_hash: string }>(
        'SELECT id, password_hash FROM person_credentials WHERE person_id = $1 AND revoked_at IS NULL',
        [person.person_id],
      );
      if (!cred || !(await argon2.verify(cred.password_hash, current))) {
        recordFailure(key);
        res.status(401).json({ message: 'The current password is not correct.' });
        return;
      }
      failures.delete(key);
      if (next.length < MIN_PASSWORD_LENGTH) {
        res.status(422).json({ message: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        return;
      }
      if (next === current) {
        res.status(422).json({ message: 'The new password must differ from the current one.' });
        return;
      }
      const hash = await argon2.hash(next, { type: argon2.argon2id });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const revoked = await client.query(
          'UPDATE person_credentials SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
          [cred.id],
        );
        if (revoked.rowCount !== 1) throw new Error('the credential changed underneath this request');
        await client.query(
          `INSERT INTO person_credentials (person_id, password_hash, set_via, must_change)
           VALUES ($1, $2, 'self', false)`,
          [person.person_id, hash],
        );
        const others = await client.query(
          'UPDATE sessions SET revoked_at = now() WHERE person_id = $1 AND id <> $2 AND revoked_at IS NULL',
          [person.person_id, person.session_id],
        );
        await client.query('COMMIT');
        res.status(200).json({ changed: true, other_sessions_ended: others.rowCount ?? 0 });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('LVRF: password change failed with a server error.', err);
      res.status(500).json({ message: 'Password change failed with a server error.' });
    }
  });

  return router;
}
