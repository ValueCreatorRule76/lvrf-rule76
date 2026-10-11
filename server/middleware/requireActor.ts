import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import type { ActorHeaderMode } from '../lib/actorHeader.js';
import { resolveActor } from '../lib/session.js';

/**
 * Sign-in P2a: every /api route except /api/health and /api/auth/* needs
 * an actor — GETs included. Until P2a a read needed nothing, or the header
 * for tenant scoping; now an unauthenticated read is a 401, so the app is
 * fail-closed for reads as well as writes (lvrf-deploy.sh checks exactly
 * that).
 *
 * Mounted after /api/health and /api/auth, before actorContext. Sets
 * req.actor; actorContext and every route read it instead of the header.
 * From P2b the actor is the session; the header counts only in headerMode
 * 'on' (lib/actorHeader.ts).
 */
export function requireActor(pool: Pool, headerMode: ActorHeaderMode) {
  return function requireActorMiddleware(req: Request, res: Response, next: NextFunction): void {
    resolveActor(pool, req, headerMode)
      .then((actor) => {
        if (!actor) {
          res.status(401).json({ message: 'Sign in to continue.' });
          return;
        }
        // Band A: a starting password (grant or reset) is replaced before
        // anything else — reads included. One check here, so no route can
        // forget it; /api/auth/* is mounted ahead of this middleware.
        if (actor.mustChange) {
          res.status(403).json({
            code: 'password_change_required',
            message: 'Choose a new password before continuing. The one you were given is a starting password.',
          });
          return;
        }
        req.actor = actor;
        next();
      })
      .catch(next);
  };
}
