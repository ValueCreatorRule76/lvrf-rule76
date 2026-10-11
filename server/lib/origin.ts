import type { NextFunction, Request, Response } from 'express';

/**
 * Sign-in P2a — the cross-site write guard. Mounted ahead of every /api
 * route, sign-in included.
 *
 * THE COOKIE ALREADY STOPS CLASSIC CSRF: it is SameSite=Lax, so a cross-site
 * POST arrives without a session. This guard covers what Lax does not:
 * a same-SITE sibling host (any *.lvrf-rule76.com would be sent the
 * cookie), a request a browser would send without a preflight, and routes
 * written later by someone who did not think about it.
 *
 * For every mutating request (POST, PUT, PATCH, DELETE):
 *   1. Content-Type must be application/json — 415 otherwise. A form or a
 *      text/plain body is how a cross-site page sends a request without a
 *      CORS preflight; JSON forces the preflight, which this API never
 *      answers.
 *   2. Sec-Fetch-Site: cross-site is refused outright — 403.
 *   3. When an Origin header is present (every browser sends one on a
 *      POST), it must be an allowed origin — 403 otherwise. No Origin means
 *      a non-browser client (curl, the verify scripts); CSRF is a browser
 *      attack, so those are not refused here.
 *
 * ALLOWED ORIGINS. LVRF_PUBLIC_ORIGIN, a comma-separated list of origins
 * (scheme + host [+ port], no path) — e.g. the apex and www hosts Caddy
 * serves. When it is MISSING:
 *   - outside production: the local Vite origins (localhost and 127.0.0.1,
 *     port 5173), so development needs no setup;
 *   - in production: the request's OWN origin — the Origin must match the
 *     scheme and Host the request arrived on (Caddy preserves Host; the
 *     scheme comes from X-Forwarded-Proto, believed only from loopback).
 *     That still refuses every cross-site write, and the site keeps
 *     working; it is reported, never silent — logged at startup, shown by
 *     /api/health as `origin_check: "fallback"`, and lvrf-deploy.sh fails
 *     its smoke test on it. Neither opens writes nor takes the site down.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEV_DEFAULT = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const ORIGIN_SHAPE = /^https?:\/\/[^/\s]+$/;

export type OriginCheck =
  | { mode: 'configured'; allowed: string[] }
  | { mode: 'dev-default'; allowed: string[] }
  | { mode: 'fallback'; allowed: null };

export function originCheck(): OriginCheck {
  const raw = process.env.LVRF_PUBLIC_ORIGIN?.trim() ?? '';
  if (raw !== '') {
    const allowed = raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const bad = allowed.filter((o) => !ORIGIN_SHAPE.test(o));
    if (bad.length > 0) {
      // A malformed value is a configuration error, not a reason to open
      // or to guess: refuse to start.
      throw new Error(`LVRF_PUBLIC_ORIGIN has malformed origin(s): ${bad.join(', ')} (expected scheme://host[:port], no path)`);
    }
    return { mode: 'configured', allowed };
  }
  if (process.env.NODE_ENV === 'production') return { mode: 'fallback', allowed: null };
  return { mode: 'dev-default', allowed: DEV_DEFAULT };
}

function ownOrigin(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? ''}`;
}

export function originGuard(check: OriginCheck) {
  return function originGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATING.has(req.method)) {
      next();
      return;
    }
    if (!req.is('application/json')) {
      res.status(415).json({ message: 'Content-Type must be application/json.' });
      return;
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ message: 'Cross-site write refused.' });
      return;
    }
    const origin = req.get('origin');
    if (origin !== undefined) {
      const allowed = check.allowed ?? [ownOrigin(req)];
      if (!allowed.includes(origin)) {
        res.status(403).json({ message: 'Cross-origin write refused.' });
        return;
      }
    }
    next();
  };
}
