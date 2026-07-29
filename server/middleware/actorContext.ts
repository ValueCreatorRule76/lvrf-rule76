import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';

/**
 * hardening.sql's audit trigger reads lvrf.actor_person_id via
 * current_setting(..., true) inside the same transaction as the write. Set it
 * with SELECT set_config(...) — a normal parameterized query — rather than
 * interpolating the value into a SET LOCAL statement, since SET does not take
 * bind parameters. There is no auth/session layer yet, so the actor comes
 * from an X-Actor-Person-Id header; wire this to the real session once one
 * exists.
 */

declare global {
  namespace Express {
    interface Request {
      dbClient?: PoolClient;
    }
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function actorContext(pool: Pool) {
  return function actorContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    let settled = false;
    const finalize = async (commit: boolean, client: PoolClient) => {
      if (settled) return;
      settled = true;
      try {
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
      } finally {
        client.release();
      }
    };

    pool
      .connect()
      .then(async (client) => {
        res.once('finish', () => {
          void finalize(res.statusCode < 400, client);
        });
        res.once('close', () => {
          void finalize(false, client);
        });

        try {
          await client.query('BEGIN');
          const actorPersonId = req.get('x-actor-person-id');
          if (actorPersonId) {
            await client.query('SELECT set_config($1, $2, true)', [
              'lvrf.actor_person_id',
              actorPersonId,
            ]);
          }
          req.dbClient = client;
          next();
        } catch (err) {
          await finalize(false, client);
          next(err);
        }
      })
      .catch(next);
  };
}
