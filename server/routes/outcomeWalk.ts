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
 * Three calls that advance a value outcome one step at a time: baseline ->
 * commit (commit), claimed -> measured (measure), and measured -> verified
 * (verify). commit is the odd one of the three: it advances value_stage,
 * not realization_status — realization stays 'claimed' through a commit;
 * only measure and verify move it. Each call still checks the outcome's
 * relevant current state before proceeding and 409s naming it otherwise —
 * commit checks committed_at (its own idempotency guard) and realization
 * (must still be 'claimed'), since realization itself doesn't change under it.
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

function isUniqueViolation(err: unknown): err is { code: '23505'; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
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

  // POST /api/value-outcomes/:outcomeId/commit — the customer agrees the
  // target is the right one. value_outcomes_commit_is_complete requires
  // target_value, committed_by_person_id and committed_at to be set
  // together or not at all; this endpoint always sets all three.
  router.post('/:outcomeId/commit', async (req, res) => {
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
      const targetValue = requireNumber(body, 'target_value', 'body');
      const committedByPersonId = requireUuidString(body, 'committed_by_person_id', 'body');
      const committedAt = requireTimestamp(body, 'committed_at', 'body');
      const commitmentNote = requireString(body, 'commitment_note', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      // tenant_id comes via institutions, same as outcomeEvidence.ts's
      // HB-0009 site — value_outcomes has no tenant_id column of its own.
      // existing_committer_name is only used if committed_at is already
      // set, to name who beat this request to it.
      const { rows: [outcome] } = await client.query<{
        id: string;
        tenant_id: string;
        institution_id: string;
        engagement_id: string;
        realization: string;
        committed_at: Date | null;
        existing_committer_name: string | null;
      }>(
        `SELECT vo.id, i.tenant_id, vo.institution_id, vo.engagement_id,
                vo.realization, vo.committed_at, cp.full_name AS existing_committer_name
           FROM value_outcomes vo
           JOIN institutions i ON i.id = vo.institution_id AND i.deleted_at IS NULL
           LEFT JOIN persons cp ON cp.id = vo.committed_by_person_id
          WHERE vo.id = $1 AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL`,
        [outcomeId],
      );
      if (!outcome) {
        res.status(404).json({ message: `value outcome ${outcomeId} not found` });
        return;
      }

      // A commitment is not amended — a second commit attempt supersedes
      // the outcome, it does not overwrite this one's target or committer.
      if (outcome.committed_at !== null) {
        res.status(409).json({
          message:
            `value outcome ${outcomeId} was already committed` +
            `${outcome.existing_committer_name ? ` by ${outcome.existing_committer_name}` : ''}` +
            ` at ${outcome.committed_at.toISOString()}; a commitment is not amended — supersede the outcome instead`,
        });
        return;
      }

      // Committing after measurement is backwards — the target is meant to
      // precede the actual it will be judged against.
      if (outcome.realization !== 'claimed') {
        res.status(409).json({
          message: `value outcome ${outcomeId} is not 'claimed' (currently '${outcome.realization}'); cannot commit`,
        });
        return;
      }

      // Same rule /verify applies to its verifier: a commitment by the
      // vendor is not a commitment. The customer has to be the one agreeing
      // to the target.
      const { rows: [committer] } = await client.query<{ full_name: string }>(
        `SELECT full_name FROM persons
          WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL`,
        [committedByPersonId, outcome.institution_id],
      );
      if (!committer) {
        res.status(422).json({
          message: `committed_by_person_id does not belong to institution ${outcome.institution_id}, or is simulated: ${committedByPersonId}`,
        });
        return;
      }

      // commitment_note as an evidence row, mirroring exactly how /verify
      // writes its attestation — kind 'attestation', provenance naming the
      // committer, attested_by/attested_at the same person and moment as
      // committed_by_person_id/committed_at on value_outcomes.
      const { rows: [evidence] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id,
           attested_by_person_id, attested_at
         ) VALUES ($1, 'attestation', $2, $3, 'medium', false, false, false, $4, $5, $6)
         RETURNING id`,
        [
          outcome.institution_id,
          commitmentNote,
          `Attested at value outcome commitment by ${committer.full_name}`,
          actorPersonId,
          committedByPersonId,
          committedAt,
        ],
      );

      // supports 'impact_basis' — stated by this task, not the dynamic
      // existingSupportsValues check /verify uses. That check exists there
      // because 'attestation' wasn't yet an established value in the table;
      // this call site doesn't inherit that uncertainty.
      await client.query(
        `INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports)
         VALUES ($1, $2, $3)`,
        [outcomeId, evidence.id, 'impact_basis'],
      );

      // Race guard, same shape as lockRun.ts's: if another request committed
      // this outcome between the SELECT above and this UPDATE, zero rows
      // come back instead of silently overwriting whoever won.
      const { rows: [updated] } = await client.query<{ committed_at: Date; value_stage: string }>(
        `UPDATE value_outcomes
            SET target_value = $1, committed_by_person_id = $2,
                committed_at = $3, value_stage = 'commit'
          WHERE id = $4 AND committed_at IS NULL
          RETURNING committed_at, value_stage`,
        [targetValue, committedByPersonId, committedAt, outcomeId],
      );
      if (!updated) {
        res.status(409).json({
          message: `value outcome ${outcomeId} was committed by another request just now; retry to see the current commitment`,
        });
        return;
      }

      // HB-0014 Value Target Committed. healthState is 'healthy' — the
      // committer check above already guarantees a real, non-simulated
      // person at the institution is the one committing, so
      // buildHeartbeatPlan's 'watch' branch for a synthetic sponsor is
      // unreachable from this call site. This endpoint enforces the
      // condition that branch exists to score; it does not reproduce the
      // branch. Do not "fix" this later to add a watch path here — that
      // would be reintroducing a hand-synchronised copy of a plan this
      // emitter is deliberately not aware of.
      await emitHeartbeat(client, {
        heartbeatId: 'HB-0014',
        tenantId: outcome.tenant_id,
        institutionId: outcome.institution_id,
        engagementId: outcome.engagement_id,
        subjectTable: 'value_outcomes',
        subjectId: outcomeId,
        actorPersonId,
        healthState: 'healthy',
        payload: {
          target_value: targetValue,
          committed_at: committedAt.toISOString(),
        },
      });

      res.status(201).json({
        outcome_id: outcomeId,
        target_value: targetValue,
        committed_at: updated.committed_at,
        committer_name: committer.full_name,
        evidence_id: evidence.id,
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
      // A unique-constraint collision (ERRCODE unique_violation, SQLSTATE
      // 23505) is a conflict with existing state, not a server fault. 409,
      // not 500; message unchanged, same as the check_violation branch above.
      if (isUniqueViolation(err)) {
        res.status(409).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

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

      const { rows: [outcome] } = await client.query<{
        id: string;
        tenant_id: string;
        institution_id: string;
        engagement_id: string;
        realization: string;
      }>(
        `SELECT vo.id, i.tenant_id, vo.institution_id, vo.engagement_id, vo.realization
           FROM value_outcomes vo
           JOIN institutions i ON i.id = vo.institution_id AND i.deleted_at IS NULL
          WHERE vo.id = $1 AND vo.deleted_at IS NULL`,
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
      // Selecting evidence.simulated alongside existence, rather than a bare
      // EXISTS, also gives HB-0015 below the same fact buildHeartbeatPlan
      // scores from (actualSimulated) without a second query or an import of
      // the plan itself.
      const { rows: actualEvidenceRows } = await client.query<{ simulated: boolean }>(
        `SELECT e.simulated
           FROM value_outcome_evidence voe
           JOIN evidence e ON e.id = voe.evidence_id
          WHERE voe.value_outcome_id = $1 AND voe.supports = 'actual'`,
        [outcomeId],
      );
      if (actualEvidenceRows.length === 0) {
        res.status(422).json({
          message:
            "no admissible evidence supports an actual for this outcome. AI-sourced, " +
            "AI-assisted, simulated and vendor-published evidence are refused by " +
            "lvrf_block_ai_actual, so an outcome with no admissible evidence cannot be measured.",
        });
        return;
      }
      // lvrf_block_ai_actual already refuses simulated evidence linked with
      // supports = 'actual' (db/hardening.sql), so this is always false via
      // this call site today — same shape as HB-0014's unreachable 'watch'
      // branch below. Computed honestly anyway: the health state is what
      // buildHeartbeatPlan would score from this evidence, not an assumption
      // that the guard above makes it moot.
      const anyActualEvidenceSimulated = actualEvidenceRows.some((r) => r.simulated);

      const { rows: [updated] } = await client.query<{ realization: string; value_stage: string }>(
        `UPDATE value_outcomes
            SET actual_value = $1, actual_measured_at = $2,
                realization = 'measured', value_stage = 'measure'
          WHERE id = $3
          RETURNING realization, value_stage`,
        [actualValue, actualMeasuredAt, outcomeId],
      );

      // HB-0015 Value Realized. healthState mirrors buildHeartbeatPlan's
      // actualSimulated branch exactly, derived here from the same evidence
      // this handler already queried above — not imported from the plan.
      await emitHeartbeat(client, {
        heartbeatId: 'HB-0015',
        tenantId: outcome.tenant_id,
        institutionId: outcome.institution_id,
        engagementId: outcome.engagement_id,
        subjectTable: 'value_outcomes',
        subjectId: outcomeId,
        actorPersonId,
        healthState: anyActualEvidenceSimulated ? 'watch' : 'healthy',
        payload: {
          actual_value: actualValue,
          actual_measured_at: actualMeasuredAt.toISOString(),
        },
      });

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

      const { rows: [outcome] } = await client.query<{
        id: string;
        tenant_id: string;
        institution_id: string;
        engagement_id: string;
        realization: string;
      }>(
        `SELECT vo.id, i.tenant_id, vo.institution_id, vo.engagement_id, vo.realization
           FROM value_outcomes vo
           JOIN institutions i ON i.id = vo.institution_id AND i.deleted_at IS NULL
          WHERE vo.id = $1 AND vo.deleted_at IS NULL`,
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

      // HB-0016 Value Verified — CONSTITUTIONAL. The seventh and last health
      // dimension LVRF can measure today; Security stays UNMEASURED until
      // authentication exists (see db/HEALTH_MODEL.md, AMENDMENT-003).
      //
      // healthState is always 'healthy' here. buildHeartbeatPlan has a
      // 'warning' branch for realization not reaching 'verified', but it is
      // UNREACHABLE at this call site: the guard above already 409s any
      // outcome not currently 'measured', and the UPDATE unconditionally
      // sets realization = 'verified' — this handler either writes a
      // completed verification or never reaches this emit. A refused
      // verification is expressed as this endpoint's 409/422 responses
      // above, not as a heartbeat for a write that didn't happen.
      await emitHeartbeat(client, {
        heartbeatId: 'HB-0016',
        tenantId: outcome.tenant_id,
        institutionId: outcome.institution_id,
        engagementId: outcome.engagement_id,
        subjectTable: 'value_outcomes',
        subjectId: outcomeId,
        actorPersonId,
        healthState: 'healthy',
        payload: {
          verified_at: verifiedAt.toISOString(),
          verified_by: verifier.full_name,
        },
      });

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
