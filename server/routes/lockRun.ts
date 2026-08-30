import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { emitHeartbeat } from '../spine/emitHeartbeat.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 *
 * Nothing in the system currently sets locked_at / locked_by_person_id /
 * lock_reason. lvrf_locked_run_immutable (db/hardening.sql) only engages
 * once locked_at is set — its guard, `IF OLD.locked_at IS NULL THEN RETURN
 * NEW; END IF;`, means the transition from unlocked to locked is itself
 * unrestricted; the trigger only fires on a SECOND update to an already-
 * locked row. So the run currently being demonstrated (produceRun.ts's
 * output) sits on a mutable row: nothing stops an UPDATE from silently
 * rewriting a confidence score after the fact. This is that missing act.
 */

class ValidationError extends Error {}

function isCheckViolation(err: unknown): err is { code: '23514'; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23514'
  );
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} is required`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

// POST /api/value-runs/:runId/lock — fixes a value_runs row as an immutable
// record. Distinct from produceRun.ts, which creates the row unlocked;
// locking and producing are two acts, and collapsing them was the error in
// the original spec (see produceRun.ts's file header).
export function lockRunRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  router.post('/:runId/lock', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const runId = req.params.runId;
    if (!isUuid(runId)) {
      res.status(400).json({ message: `invalid value run id: ${runId}` });
      return;
    }

    try {
      const body = requireObject(req.body, 'body');
      const lockReason = requireString(body, 'lock_reason', 'body');

      // actorContext has already refused this request if the actor is
      // missing, unknown, soft-deleted, or simulated — that is the "real,
      // non-simulated" requirement satisfied, not re-implemented here.
      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [run] } = await client.query<{
        id: string;
        tenant_id: string;
        engagement_id: string;
        institution_id: string;
        locked_at: Date | null;
        locked_by_full_name: string | null;
      }>(
        `SELECT vr.id, vr.tenant_id, vr.engagement_id, e.institution_id,
                vr.locked_at, p.full_name AS locked_by_full_name
           FROM value_runs vr
           JOIN engagements e ON e.id = vr.engagement_id AND e.deleted_at IS NULL
           LEFT JOIN persons p ON p.id = vr.locked_by_person_id
          WHERE vr.id = $1 AND vr.deleted_at IS NULL`,
        [runId],
      );
      if (!run) {
        res.status(404).json({ message: `value run ${runId} not found` });
        return;
      }

      // Rule 3 of lvrf_supersession_is_sane would catch a re-lock attempt
      // eventually (relocking means superseding, not editing), but that is
      // a different table's constraint firing on a different write. A
      // clear 409 naming who already locked it and when beats waiting for
      // some later operation to fail for an unrelated reason.
      if (run.locked_at !== null) {
        res.status(409).json({
          message:
            `value run ${runId} is already locked (locked_at ${run.locked_at.toISOString()}` +
            `${run.locked_by_full_name ? `, by ${run.locked_by_full_name}` : ''}). ` +
            'A locked run cannot be re-locked — supersede it with a new run instead.',
        });
        return;
      }

      const { rows: [actor] } = await client.query<{ full_name: string }>(
        'SELECT full_name FROM persons WHERE id = $1',
        [actorPersonId],
      );

      // locked_at IS NULL in the WHERE clause guards against a race: if
      // another request locked this row between the SELECT above and this
      // UPDATE, zero rows come back here instead of silently overwriting
      // whoever won. lvrf_locked_run_immutable does not block this write —
      // its guard only engages once OLD.locked_at is already set, and here
      // it still is NULL going in.
      const { rows: [locked] } = await client.query<{ locked_at: Date }>(
        `UPDATE value_runs
            SET locked_at = now(), locked_by_person_id = $1, lock_reason = $2
          WHERE id = $3 AND locked_at IS NULL
          RETURNING locked_at`,
        [actorPersonId, lockReason, runId],
      );
      if (!locked) {
        res.status(409).json({
          message: `value run ${runId} was locked by another request just now; retry to see the current lock`,
        });
        return;
      }

      // HB-0006 Object Locked. Same transaction as the UPDATE above: if this
      // throws, the whole transaction rolls back, the lock included. That is
      // correct — a lock with no heartbeat recording it is a governed action
      // with no record of it, which is worse than no lock at all.
      await emitHeartbeat(client, {
        heartbeatId: 'HB-0006',
        tenantId: run.tenant_id,
        institutionId: run.institution_id,
        engagementId: run.engagement_id,
        valueRunId: runId,
        subjectTable: 'value_runs',
        subjectId: runId,
        actorPersonId,
        // A run being locked is the governance mechanism working, not a
        // failure of anything — 'healthy', not a state carrying severity.
        healthState: 'healthy',
        payload: {
          lock_reason: lockReason,
          locked_value_run_id: runId,
        },
      });

      res.status(200).json({
        run_id: runId,
        locked_at: locked.locked_at,
        locked_by_full_name: actor.full_name,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault. Its
      // message names the amendment and the reason — that message IS the
      // product here, so it goes to the caller unchanged, not swallowed
      // into a generic 500.
      if (isCheckViolation(err)) {
        res.status(422).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
