import type { Request, Response } from 'express';
import type { Pool } from 'pg';

/**
 * 2.0 item 2, part B. isCheckViolation/isUniqueViolation were defined
 * independently in ten route files, byte-identical each time — the sixth
 * convention this codebase has found that was not a constraint (see
 * confidenceModel.ts's MODEL_VERSION/MODEL_FINGERPRINT comment for the
 * running count). This is the one copy, and it now also RECORDS what it
 * catches, into `refusals` (migration 0016) — see that migration and
 * db/schema.ts for why a refusal needs its own table and cannot live in
 * audit_log.
 */

function isCheckViolation(err: unknown): err is { code: '23514'; message: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23514'
  );
}

function isUniqueViolation(err: unknown): err is { code: '23505'; message: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export interface RefusalContext {
  /** Method and path pattern, e.g. 'POST /api/value-outcomes/:outcomeId/commit'. */
  endpoint: string;
  subjectTable: string;
  /** The subject may not exist yet. */
  subjectId: string | null;
  tenantId: string | null;
  institutionId: string | null;
  /** What was offered. Pass req.body verbatim — see recordRefusal below. */
  attemptedPayload: unknown;
}

/**
 * THE CRITICAL PART — read this twice before touching this function.
 *
 * This writes on `pool`, a SEPARATE CONNECTION FROM THE POOL — never
 * `req.dbClient`. This is the ONLY write in this codebase that deliberately
 * commits outside the request's transaction, and it is correct.
 *
 * actorContext (server/middleware/actorContext.ts) opens a transaction on
 * `req.dbClient` for every mutating request and ROLLS IT BACK on any
 * response status >= 400 — see its `finalize(res.statusCode < 400, client)`
 * call on `res.once('finish')`. A check_violation or unique_violation
 * response is always >= 400 (422 or 409), so if a refusal row were inserted
 * on `req.dbClient`, that INSERT would be rolled back in the very same
 * ROLLBACK that undoes the write it is trying to record. The refusal would
 * erase itself the instant it was created — a record that can never
 * survive the event it describes is not a record.
 *
 * The refusal happened regardless of what the transaction did: the
 * database refused a write, and that fact is true whether or not the rest
 * of the request's work is kept. Recording it therefore has to happen on a
 * connection whose commit is not gated by this request's outcome — `pool`,
 * which opens (or reuses) its own connection, runs its own implicit
 * transaction for this one INSERT, and commits it independently.
 *
 * DO NOT "fix" this to use req.dbClient for consistency with every other
 * write in this codebase. That consistency is exactly what would silently
 * delete every refusal record ever written — the rollback would not error,
 * so nothing would announce that it happened. If this ever looks like an
 * inconsistency worth cleaning up, it isn't; it is the one place the rule
 * "always write on req.dbClient" does not apply, and the reason is above.
 *
 * actor_person_id is read from the x-actor-person-id header directly, not
 * from `SELECT current_setting('lvrf.actor_person_id', ...)` on any
 * connection — that setting was SET LOCAL on req.dbClient's transaction,
 * which this write is deliberately not part of, and which may be rolling
 * back at this exact moment regardless.
 */
async function recordRefusal(
  pool: Pool,
  req: Request,
  context: RefusalContext,
  sqlstate: string,
  constraintName: string | null,
  message: string,
): Promise<void> {
  try {
    const actorPersonId = req.get('x-actor-person-id') ?? null;
    if (!actorPersonId) {
      // actor_person_id is NOT NULL on refusals, and actorContext already
      // refuses any mutating request without this header before a handler
      // can run — reaching here without it means that guarantee broke, the
      // same broken-guarantee case every route already throws on. There is
      // no person to attribute this row to, so no row is written; this is
      // a write failure, handled exactly like any other below.
      throw new Error('x-actor-person-id missing on a request past actorContext');
    }

    await pool.query(
      `INSERT INTO refusals (
         tenant_id, institution_id, actor_person_id, endpoint, subject_table,
         subject_id, sqlstate, constraint_name, message, attempted_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        context.tenantId,
        context.institutionId,
        actorPersonId,
        context.endpoint,
        context.subjectTable,
        context.subjectId,
        sqlstate,
        constraintName,
        message,
        // What was offered — req.body, unsanitised and untrimmed, is the point.
        context.attemptedPayload,
      ],
    );
  } catch (writeErr) {
    // A failure to record must never turn a governance refusal into a 500.
    // The caller's answer does not depend on our bookkeeping — log it and
    // let handleGovernanceError respond with the 422/409 regardless.
    console.error('LVRF: failed to record a refusal row. The governance response still stands.', writeErr);
  }
}

/**
 * The shared catch-block handler for `isCheckViolation` / `isUniqueViolation`
 * — was ten byte-identical copies, one per route file. Same response shape
 * as every prior copy: check_violation -> 422, unique_violation -> 409,
 * `err.message` unchanged (never truncated, rewritten or summarised — that
 * sentence is the product). Returns false for any other error so the
 * caller falls through to its existing 500.
 */
export async function handleGovernanceError(
  pool: Pool,
  err: unknown,
  req: Request,
  res: Response,
  context: RefusalContext,
): Promise<boolean> {
  let status: 422 | 409;
  if (isCheckViolation(err)) {
    status = 422;
  } else if (isUniqueViolation(err)) {
    status = 409;
  } else {
    return false;
  }

  await recordRefusal(pool, req, context, err.code, err.constraint ?? null, err.message);

  res.status(status).json({ message: err.message });
  return true;
}
