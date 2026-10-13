import type { NextFunction, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';

/**
 * hardening.sql's audit trigger reads lvrf.actor_person_id via
 * current_setting(..., true) inside the same transaction as the write. Set it
 * with SELECT set_config(...) — a normal parameterized query — rather than
 * interpolating the value into a SET LOCAL statement, since SET does not take
 * bind parameters.
 *
 * THE ACTOR COMES FROM req.actor (sign-in P2a), set by requireActor before
 * this middleware runs: the signed-in session, or — for the verify scripts
 * only, outside production (P2b) — the X-Actor-Person-Id header. Either way
 * resolveActor has already confirmed
 * a current, non-simulated vendor-staff person, so nothing here re-reads
 * the header or re-checks the person.
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
        // COMMIT BEFORE THE RESPONSE, NOT AFTER IT. Until 10 October this
        // middleware committed in res.once('finish') — which fires only
        // after the response has been flushed to the client. A client that
        // got a 2xx and read again at once could miss the row it had just
        // written (seen in verify_pack_review.sh, and in the Account facts
        // card's reload), and a COMMIT that failed — the deferred
        // heartbeat_events_value_run_fk is checked only at COMMIT — was
        // reported as a success while the write was silently rolled back.
        //
        // Every route answers through res.json (checked: none uses send,
        // end, sendFile or redirect). So res.json is wrapped: on its first
        // call, the transaction is finished FIRST — COMMIT for a status
        // under 400, ROLLBACK otherwise — and only then is the body sent.
        // If COMMIT itself fails, the caller gets a 500 saying the write was
        // not committed, never the 2xx the handler intended.
        //
        // THE TWO OUTCOMES ARE HANDLED SEPARATELY, and every path is caught
        // and logged. The old commit ran as `void finalize(...)` in 'finish':
        // a failed COMMIT was an unhandled rejection, and Node exited — the
        // whole API process died after the false 2xx had already gone out
        // (BUILD_STATUS, "Commit before the response"). Now:
        //   - COMMIT succeeded: send the body. If sending throws, log it —
        //     the write IS saved, and the caller is never told otherwise.
        //   - COMMIT failed: log it, then send the 500. If even that send
        //     throws, log that too. Nothing is left to reject unhandled.
        //
        // Handlers must not touch req.dbClient after calling res.json — the
        // client has been released by then. Every heartbeat emission was
        // checked to run before its route's response.
        const originalJson = res.json.bind(res);
        res.json = ((body?: unknown) => {
          if (settled) return originalJson(body);
          const commit = res.statusCode < 400;
          finalize(commit, client).then(
            () => {
              try {
                originalJson(body);
              } catch (err) {
                console.error('LVRF: response could not be sent after a successful COMMIT; the write IS saved.', err);
              }
            },
            (err: unknown) => {
              console.error('LVRF: COMMIT failed; the write was not saved.', err);
              try {
                res.status(500);
                originalJson({
                  message:
                    // Q4k: a rule the schema wrote for people ("LVRF: …", e.g. a
                    // deferred one-current check) is said as written; Postgres's
                    // own text is not (it names constraints) — logged above.
                    `The write was not committed: ${err instanceof Error && err.message.startsWith('LVRF:') ? err.message : 'a database rule refused it when it was saved'}. ` +
                    'Nothing from this request was saved.',
                });
              } catch (sendErr) {
                console.error('LVRF: could not send the COMMIT-failure response.', sendErr);
              }
            },
          );
          return res;
        }) as typeof res.json;

        // Fallbacks only. 'finish' covers a response that did not go through
        // res.json (Express's default error handler, after next(err)) —
        // decided by status, as before. 'close' covers a client that
        // disconnects before any response: roll back. Both are no-ops once
        // the wrapper above has settled the transaction.
        res.once('finish', () => {
          finalize(res.statusCode < 400, client).catch((err) =>
            console.error('LVRF: transaction finalize failed in fallback handler.', err));
        });
        res.once('close', () => {
          finalize(false, client).catch((err) =>
            console.error('LVRF: transaction finalize failed in fallback handler.', err));
        });

        try {
          await client.query('BEGIN');

          // requireActor is mounted ahead of this middleware; reaching here
          // without req.actor means that ordering broke — refuse, never write
          // unattributed.
          const actorPersonId = req.actor?.personId;
          if (!actorPersonId) {
            res.status(401).json({ message: 'Sign in to continue.' });
            return;
          }

          await client.query('SELECT set_config($1, $2, true)', [
            'lvrf.actor_person_id',
            actorPersonId,
          ]);
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
