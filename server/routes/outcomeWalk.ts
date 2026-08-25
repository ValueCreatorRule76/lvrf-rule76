import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 *
 * Two calls that advance a value outcome's realization_status one step at a
 * time: claimed -> measured (measure) and measured -> verified (verify).
 * Neither call may skip a state or re-run a completed one — each checks the
 * outcome's current realization and 409s naming it otherwise.
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

function requireUuidString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = requireString(obj, field, path);
  if (!isUuid(v)) {
    throw new ValidationError(`${path}.${field} must be a valid UUID`);
  }
  return v;
}

function optionalNullableString(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  const v = obj[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ValidationError(`${path}.${field} must be a string or null`);
  }
  return v;
}

function requireNumber(obj: Record<string, unknown>, field: string, path: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function requireTimestamp(obj: Record<string, unknown>, field: string, path: string): Date {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${path}.${field} must be a valid ISO timestamp`);
  }
  return date;
}

export function outcomeWalkRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  // POST /api/value-outcomes/:outcomeId/measure — claimed -> measured.
  router.post('/:outcomeId/measure', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const outcomeId = req.params.outcomeId;
    if (!isUuid(outcomeId)) {
      res.status(400).json({ message: `invalid value outcome id: ${outcomeId}` });
      return;
    }

    try {
      const body = requireObject(req.body, 'body');
      const actualValue = requireNumber(body, 'actual_value', 'body');
      const actualMeasuredAt = requireTimestamp(body, 'actual_measured_at', 'body');
      // Accepted and type-checked, but not persisted: value_outcomes has no
      // column for it and nothing downstream reads it yet. Not silently
      // dropped without acknowledgment — this comment is that acknowledgment.
      optionalNullableString(body, 'note', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [outcome] } = await client.query<{ id: string; realization: string }>(
        'SELECT id, realization FROM value_outcomes WHERE id = $1 AND deleted_at IS NULL',
        [outcomeId],
      );
      if (!outcome) {
        res.status(404).json({ message: `value outcome ${outcomeId} not found` });
        return;
      }
      if (outcome.realization !== 'claimed') {
        res.status(409).json({
          message: `value outcome ${outcomeId} is not 'claimed' (currently '${outcome.realization}'); cannot measure`,
        });
        return;
      }

      // value_outcomes_measured_requires_actual (the schema CHECK) demands
      // only that actual_value and actual_measured_at are NOT NULL — it says
      // nothing about whether any evidence backs that number.
      // lvrf_block_ai_actual is the trigger that judges evidence quality,
      // but it fires on value_outcome_evidence, not on value_outcomes: an
      // actual could be written here with no admissible evidence linked to
      // it at all. The wall would have a door beside it. This precondition
      // closes that door in the application, where the schema cannot — any
      // row that DOES exist with supports = 'actual' already passed
      // lvrf_block_ai_actual at the moment it was linked, so existence here
      // is sufficient; the admissibility filtering has already happened.
      const { rows: [{ exists: hasActualEvidence }] } = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM value_outcome_evidence
            WHERE value_outcome_id = $1 AND supports = 'actual'
         )`,
        [outcomeId],
      );
      if (!hasActualEvidence) {
        res.status(422).json({
          message:
            "no admissible evidence supports an actual for this outcome. AI-sourced, " +
            "AI-assisted, simulated and vendor-published evidence are refused by " +
            "lvrf_block_ai_actual, so an outcome with no admissible evidence cannot be measured.",
        });
        return;
      }

      const { rows: [updated] } = await client.query<{ realization: string; value_stage: string }>(
        `UPDATE value_outcomes
            SET actual_value = $1, actual_measured_at = $2,
                realization = 'measured', value_stage = 'measure'
          WHERE id = $3
          RETURNING realization, value_stage`,
        [actualValue, actualMeasuredAt, outcomeId],
      );

      res.status(200).json({
        realization: updated.realization,
        value_stage: updated.value_stage,
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

  // POST /api/value-outcomes/:outcomeId/verify — measured -> verified.
  router.post('/:outcomeId/verify', async (req, res) => {
    const client = req.dbClient!;

    const outcomeId = req.params.outcomeId;
    if (!isUuid(outcomeId)) {
      res.status(400).json({ message: `invalid value outcome id: ${outcomeId}` });
      return;
    }

    try {
      const body = requireObject(req.body, 'body');
      const verifiedByPersonId = requireUuidString(body, 'verified_by_person_id', 'body');
      const verifiedAt = requireTimestamp(body, 'verified_at', 'body');
      const attestationNote = requireString(body, 'attestation_note', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [outcome] } = await client.query<{ id: string; institution_id: string; realization: string }>(
        'SELECT id, institution_id, realization FROM value_outcomes WHERE id = $1 AND deleted_at IS NULL',
        [outcomeId],
      );
      if (!outcome) {
        res.status(404).json({ message: `value outcome ${outcomeId} not found` });
        return;
      }
      if (outcome.realization !== 'measured') {
        // value_outcomes_verified_requires_human would reject this write
        // anyway once realization flips to 'verified' without the rest of
        // the row being complete — but that is a constraint violation with
        // no context. A 409 naming the actual current state is a clearer
        // refusal for the exact same reason.
        res.status(409).json({
          message: `value outcome ${outcomeId} is not 'measured' (currently '${outcome.realization}'); cannot verify`,
        });
        return;
      }

      // value_outcomes_verified_requires_human requires a NAMED person; it
      // does not require that person to be AT the institution. But the
      // point of verification is that the customer confirms their own
      // numbers — a vendor verifying its own claim is exactly the conflict
      // this role exists to remove. Enforced here, not just at the schema.
      const { rows: [verifier] } = await client.query<{ full_name: string }>(
        `SELECT full_name FROM persons
          WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL`,
        [verifiedByPersonId, outcome.institution_id],
      );
      if (!verifier) {
        res.status(422).json({
          message: `verified_by_person_id does not belong to institution ${outcome.institution_id}, or is simulated: ${verifiedByPersonId}`,
        });
        return;
      }

      // supports is free text, not an enum — value_outcome_evidence has no
      // CHECK constraint naming its legal members, only the convention
      // baked into walkSpine.ts and confidenceModel.ts ('baseline',
      // 'actual', 'impact_basis'). 'attestation' is not among the values
      // those consumers already handle, so rather than assume it is safe to
      // introduce, check what the table actually contains and prefer it
      // only if some other write has already established it as real.
      const { rows: supportsRows } = await client.query<{ supports: string }>(
        'SELECT DISTINCT supports FROM value_outcome_evidence',
      );
      const existingSupportsValues = new Set(supportsRows.map((r) => r.supports));
      const supportsValue = existingSupportsValues.has('attestation') ? 'attestation' : 'impact_basis';

      // The actor (x-actor-person-id) is who MADE this write — captured via
      // captured_by_person_id and the audit trigger. verified_by_person_id
      // is who ATTESTED. Those are different roles and may be different
      // people: an account team member can enter a verification that a
      // named customer contact performed.
      // attested_by_person_id/attested_at name the same person and moment
      // as verified_by_person_id/verified_at on value_outcomes — the schema
      // built evidence_attestation_is_complete for exactly this row. Left
      // null, the attestor would only be discoverable by joining back to
      // value_outcomes; set here, the evidence row is self-describing.
      const { rows: [evidence] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id,
           attested_by_person_id, attested_at
         ) VALUES ($1, 'attestation', $2, $3, 'medium', false, false, false, $4, $5, $6)
         RETURNING id`,
        [
          outcome.institution_id,
          attestationNote,
          `Attested at value outcome verification by ${verifier.full_name}`,
          actorPersonId,
          verifiedByPersonId,
          verifiedAt,
        ],
      );

      await client.query(
        `INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports)
         VALUES ($1, $2, $3)`,
        [outcomeId, evidence.id, supportsValue],
      );

      const { rows: [updated] } = await client.query<{ realization: string; value_stage: string }>(
        `UPDATE value_outcomes
            SET verified_by_person_id = $1, verified_at = $2,
                source_verified = true, realization = 'verified', value_stage = 'verify'
          WHERE id = $3
          RETURNING realization, value_stage`,
        [verifiedByPersonId, verifiedAt, outcomeId],
      );

      res.status(200).json({
        realization: updated.realization,
        value_stage: updated.value_stage,
        evidence_id: evidence.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (isCheckViolation(err)) {
        res.status(422).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
