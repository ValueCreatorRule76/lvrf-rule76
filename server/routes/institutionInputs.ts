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
 * accountInputs.ts is create-only: it 409s on a duplicate institution name,
 * so there was no path to add a person, capability-linked assessment, or
 * anything else to an institution that already exists. This route is that
 * path. It does not create institutions or capabilities — a capability
 * arrives by attaching an offering (offeringAttachment.ts), not by being
 * typed into an assessment payload here.
 *
 * No idempotency key on persons: persons have no natural key (email is
 * globally unique across persons but nothing here treats it as an
 * idempotency token), so two identical calls create two people. That is a
 * known, deliberate gap, not an oversight — inventing a natural key would
 * be guessing at one the schema doesn't have.
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

function optionalBoolean(
  obj: Record<string, unknown>,
  field: string,
  path: string,
  fallback: boolean,
): boolean {
  const v = obj[field];
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') {
    throw new ValidationError(`${path}.${field} must be a boolean`);
  }
  return v;
}

function requireBoolean(obj: Record<string, unknown>, field: string, path: string): boolean {
  const v = obj[field];
  if (typeof v !== 'boolean') {
    throw new ValidationError(`${path}.${field} is required`);
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

function optionalNumber(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): number | undefined {
  const v = obj[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${path}.${field} must be a number`);
  }
  return v;
}

function optionalArray(obj: Record<string, unknown>, field: string, path: string): unknown[] {
  const v = obj[field];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new ValidationError(`${path}.${field} must be an array`);
  }
  return v;
}

// POST /api/institutions/:institutionId/inputs — adds persons and/or
// capability assessments to an institution that already exists. Every
// section of the payload is optional, but at least one must be present.
export function institutionInputsRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  router.post('/:institutionId/inputs', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }

    try {
      const body = requireObject(req.body, 'body');

      const personInputs = optionalArray(body, 'persons', 'body').map((p, i) =>
        requireObject(p, `persons[${i}]`),
      );
      const assessmentInputs = optionalArray(body, 'assessments', 'body').map((a, i) =>
        requireObject(a, `assessments[${i}]`),
      );

      if (personInputs.length === 0 && assessmentInputs.length === 0) {
        throw new ValidationError('body: at least one of persons or assessments is required');
      }

      // Pre-flight shape check on every person id in the body, before any
      // query runs — a garbage string reaching Postgres as a uuid parameter
      // becomes 22P02 (invalid_text_representation), which is a fault, not
      // a validation failure, and would surface as an undeserved 500.
      for (const [i, assessmentInput] of assessmentInputs.entries()) {
        requireUuidString(assessmentInput, 'owner_or_learner_person_id', `assessments[${i}]`);
      }

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [institution] } = await client.query<{ id: string }>(
        'SELECT id FROM institutions WHERE id = $1 AND deleted_at IS NULL',
        [institutionId],
      );
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }

      // Persons are created before assessments are resolved, so a payload
      // can add a roster and score against it in the same call.
      const personIds: string[] = [];
      for (const [i, personInput] of personInputs.entries()) {
        const path = `persons[${i}]`;
        const fullName = requireString(personInput, 'full_name', path);
        const email = requireString(personInput, 'email', path);
        const title = optionalNullableString(personInput, 'title', path);
        const simulated = optionalBoolean(personInput, 'simulated', path, false);

        const { rows: [person] } = await client.query<{ id: string }>(
          `INSERT INTO persons (institution_id, full_name, email, title, simulated)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [institutionId, fullName, email, title, simulated],
        );
        personIds.push(person.id);
      }

      const assessmentIds: string[] = [];
      for (const [i, assessmentInput] of assessmentInputs.entries()) {
        const path = `assessments[${i}]`;
        const learnerPersonId = requireUuidString(assessmentInput, 'owner_or_learner_person_id', path);
        const capabilityName = requireString(assessmentInput, 'capability_name', path);
        const score = requireNumber(assessmentInput, 'score', path);
        const scaleMin = optionalNumber(assessmentInput, 'scale_min', path) ?? 0;
        const scaleMax = optionalNumber(assessmentInput, 'scale_max', path) ?? 5;
        // Required, never defaulted: a default would have the system assert
        // a human scored this when nobody said so.
        const aiAssisted = requireBoolean(assessmentInput, 'ai_assisted', path);
        const notes = optionalNullableString(assessmentInput, 'notes', path);

        const { rows: [learner] } = await client.query<{ id: string }>(
          'SELECT id FROM persons WHERE id = $1 AND institution_id = $2 AND deleted_at IS NULL',
          [learnerPersonId, institutionId],
        );
        if (!learner) {
          res.status(422).json({
            message: `${path}: owner_or_learner_person_id does not belong to institution ${institutionId}: ${learnerPersonId}`,
          });
          return;
        }

        // Capabilities are not created here — they arrive by attaching an
        // offering. An assessment against a capability nobody attached is
        // a naming error, not a gap to paper over with an implicit create.
        // Resolving by name, not id — filter the supersession chain or this
        // can match a superseded ancestor.
        const { rows: [capability] } = await client.query<{ id: string }>(
          `SELECT id FROM capabilities
            WHERE institution_id = $1 AND name = $2
              AND deleted_at IS NULL AND superseded_by_id IS NULL`,
          [institutionId, capabilityName],
        );
        if (!capability) {
          res.status(422).json({
            message: `${path}: capability not found for this institution: ${capabilityName}`,
          });
          return;
        }

        // assessed_by_person_id is the actor from the header, never a
        // payload field: whoever enters the score is the assessor of record.
        const { rows: [assessment] } = await client.query<{ id: string }>(
          `INSERT INTO assessments (
             institution_id, learner_person_id, capability_id,
             score, scale_min, scale_max,
             assessed_by_person_id, ai_assisted, notes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            institutionId, learnerPersonId, capability.id,
            score, scaleMin, scaleMax,
            actorPersonId, aiAssisted, notes,
          ],
        );
        assessmentIds.push(assessment.id);
      }

      res.status(201).json({
        person_ids: personIds,
        assessment_ids: assessmentIds,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault — including
      // lvrf_block_simulated_attestor, which raises with this same ERRCODE
      // when assessed_by_person_id names a simulated person (AMENDMENT-005
      // Article I). Its message names the amendment and the reason, so it
      // goes to the caller unchanged, not swallowed into a generic 500.
      if (isCheckViolation(err)) {
        res.status(422).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
