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
 * The customer conversation in software: an Outside-In hypothesis becomes a
 * validated baseline when the customer supplies a figure from their own
 * system of record. This is SUPERSESSION, not update — lvrf_supersession_is_
 * sane (db/hardening.sql, applied to all fourteen tables carrying
 * superseded_by_id) enforces the chain structurally: not self, target
 * exists and is not retired, no forked chains, and the superseding row must
 * be newer. Both the old metric and every old outcome it fed survive
 * untouched as the record of what was believed before.
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

function optionalUuidString(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): string | undefined {
  const v = obj[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !isUuid(v)) {
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

// Same rule as valueOutcomes.ts: source_system is the metric's provenance,
// not free-form metadata. For a validated metric this field is the whole
// point — it should now name a real customer system, not an assertion.
const MIN_SOURCE_SYSTEM_LENGTH = 12;

function requireSourceSystem(obj: Record<string, unknown>, field: string, path: string): string {
  const v = requireString(obj, field, path);
  if (v.trim().length < MIN_SOURCE_SYSTEM_LENGTH) {
    throw new ValidationError(
      `${path}.${field} must name the source system in at least ${MIN_SOURCE_SYSTEM_LENGTH} characters`,
    );
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

// POST /api/business-metrics/:metricId/validate — replaces an ASSERTED
// metric with a SOURCED one and supersedes every value outcome that used
// it. Cut-roster item 5: "validate and supersede."
export function validateMetricRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  router.post('/:metricId/validate', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const metricId = req.params.metricId;
    if (!isUuid(metricId)) {
      res.status(400).json({ message: `invalid business metric id: ${metricId}` });
      return;
    }

    try {
      const body = requireObject(req.body, 'body');

      const metricInput = requireObject(body.metric, 'body.metric');
      // A different name is a different metric, not a validation of this
      // one — the new metric's name is copied from the metric being
      // validated (below), never taken from the payload.
      if ('name' in metricInput) {
        throw new ValidationError(
          'body.metric.name is not accepted — the new metric copies the name of the metric being validated',
        );
      }
      const metricUnit = requireString(metricInput, 'unit', 'body.metric');
      const metricDirection = requireString(metricInput, 'direction', 'body.metric');
      const metricSourceSystem = requireSourceSystem(metricInput, 'source_system', 'body.metric');
      const metricDefinitionNotes = optionalNullableString(metricInput, 'definition_notes', 'body.metric');
      const metricReportingCadence = optionalNullableString(metricInput, 'reporting_cadence', 'body.metric');
      const metricOwnerPersonId = optionalUuidString(metricInput, 'owner_person_id', 'body.metric');

      const baselineValue = requireNumber(body, 'baseline_value', 'body');
      const baselineMeasuredAt = requireTimestamp(body, 'baseline_measured_at', 'body');
      const confirmedByPersonId = requireUuidString(body, 'confirmed_by_person_id', 'body');
      const supersessionReason = requireString(body, 'supersession_reason', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [oldMetric] } = await client.query<{
        id: string;
        institution_id: string;
        name: string;
        superseded_by_id: string | null;
      }>(
        'SELECT id, institution_id, name, superseded_by_id FROM business_metrics WHERE id = $1 AND deleted_at IS NULL',
        [metricId],
      );
      if (!oldMetric) {
        res.status(404).json({ message: `business metric ${metricId} not found` });
        return;
      }

      // lvrf_supersession_is_sane's rule 3 would catch this as a forked
      // chain, but a clear 409 naming the existing successor beats a
      // constraint violation.
      if (oldMetric.superseded_by_id !== null) {
        res.status(409).json({
          message: `business metric ${metricId} has already been superseded by ${oldMetric.superseded_by_id}`,
        });
        return;
      }

      const { rows: [confirmer] } = await client.query<{ full_name: string }>(
        `SELECT full_name FROM persons
          WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL`,
        [confirmedByPersonId, oldMetric.institution_id],
      );
      if (!confirmer) {
        res.status(422).json({
          message: `confirmed_by_person_id does not belong to institution ${oldMetric.institution_id}, or is simulated: ${confirmedByPersonId}`,
        });
        return;
      }

      // Read from the database rather than hardcoding the enum's members —
      // a future migration that adds or renames a direction should not
      // require this file to be edited to notice.
      const { rows: directionRows } = await client.query<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'metric_direction'
          ORDER BY e.enumsortorder`,
      );
      const validDirections = directionRows.map((r) => r.enumlabel);
      if (!validDirections.includes(metricDirection)) {
        res.status(422).json({
          message: `body.metric.direction must be one of: ${validDirections.join(', ')}`,
        });
        return;
      }

      // The new metric: same name and institution, new unit/direction/
      // source_system, confirmation pair set at creation — never left to a
      // second write, which is what migration 0013's both-or-neither CHECK
      // and lvrf_block_simulated_attestor both assume of a confirmed row.
      const { rows: [newMetric] } = await client.query<{ id: string }>(
        `INSERT INTO business_metrics (
           institution_id, name, unit, direction, source_system,
           owner_person_id, reporting_cadence, definition_notes,
           definition_confirmed_by_person_id, definition_confirmed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         RETURNING id`,
        [
          oldMetric.institution_id, oldMetric.name, metricUnit, metricDirection, metricSourceSystem,
          metricOwnerPersonId ?? null, metricReportingCadence, metricDefinitionNotes,
          confirmedByPersonId,
        ],
      );

      // Fires lvrf_supersession_is_sane on the OLD row: not self (different
      // ids), target exists and is not retired (newMetric just inserted,
      // visible in this transaction), not already claimed by another row
      // (freshly created), and newer than what it replaces (newMetric's
      // created_at is now(); oldMetric's is whenever it was first created —
      // always earlier).
      await client.query(
        'UPDATE business_metrics SET superseded_by_id = $1 WHERE id = $2',
        [newMetric.id, metricId],
      );

      // Copy engagement_id, capability_id, institution_id from each old
      // outcome — never accepted from the payload. A value outcome against
      // a capability or engagement nobody named here is not this route's
      // call to make.
      const { rows: oldOutcomes } = await client.query<{
        id: string;
        engagement_id: string;
        capability_id: string;
        institution_id: string;
        realization: string;
      }>(
        `SELECT id, engagement_id, capability_id, institution_id, realization
           FROM value_outcomes
          WHERE business_metric_id = $1 AND deleted_at IS NULL`,
        [metricId],
      );

      const outcomes: Array<{ old_outcome_id: string; new_outcome_id: string }> = [];
      for (const oldOutcome of oldOutcomes) {
        // Superseding a measured or verified outcome is a different
        // operation with different rules — the actual and any currency
        // figures would need their own disposition, which is out of scope
        // here.
        if (oldOutcome.realization !== 'claimed') {
          res.status(422).json({
            message: `value outcome ${oldOutcome.id} is not 'claimed' (currently '${oldOutcome.realization}'); superseding a measured or verified outcome is a different operation and is not in scope`,
          });
          return;
        }

        // value_stage 'baseline', realization 'claimed', confidence 'low',
        // source_verified false — the same defaults valueOutcomes.ts uses.
        // Validating a baseline does not measure an actual: no
        // actual_value, target_value, or currency field is carried over or
        // set here.
        const { rows: [newOutcome] } = await client.query<{ id: string }>(
          `INSERT INTO value_outcomes (
             engagement_id, institution_id, capability_id, business_metric_id,
             value_stage, baseline_value, baseline_measured_at,
             realization, confidence, source_verified
           )
           VALUES ($1, $2, $3, $4, 'baseline', $5, $6, 'claimed', 'low', false)
           RETURNING id`,
          [
            oldOutcome.engagement_id, oldOutcome.institution_id, oldOutcome.capability_id, newMetric.id,
            baselineValue, baselineMeasuredAt,
          ],
        );

        await client.query(
          'UPDATE value_outcomes SET superseded_by_id = $1 WHERE id = $2',
          [newOutcome.id, oldOutcome.id],
        );

        outcomes.push({ old_outcome_id: oldOutcome.id, new_outcome_id: newOutcome.id });
      }

      const { rows: [evidence] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id
         ) VALUES ($1, 'observation', $2, $3, 'medium', false, false, false, $4)
         RETURNING id`,
        [
          oldMetric.institution_id,
          supersessionReason,
          `Asserted at metric validation by ${confirmer.full_name}`,
          actorPersonId,
        ],
      );

      res.status(201).json({
        new_metric_id: newMetric.id,
        superseded_metric_id: metricId,
        outcomes,
        evidence_id: evidence.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault — including
      // lvrf_supersession_is_sane, whose messages name which rule fired.
      // That message IS the product here, so it goes to the caller
      // unchanged, not swallowed into a generic 500.
      if (isCheckViolation(err)) {
        res.status(422).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
