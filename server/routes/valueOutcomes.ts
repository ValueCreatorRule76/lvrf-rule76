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
 * This is the middle of the value spine — baseline, attach, model, commit —
 * which previously existed only inside walkSpine.ts. It creates an
 * engagement (if none is named), a business metric (if it does not already
 * exist), and a value outcome at value_stage 'baseline', in one transaction.
 * It does not walk the outcome any further: target/commit, actual/measure,
 * and verification are later calls against the five CHECK constraints on
 * value_outcomes, not this one.
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

// source_system is the provenance of the metric, not free-form metadata. A
// value shorter than this is treated the same as a blank one: an unstated
// origin is the failure this system exists to prevent. Content beyond length
// is deliberately not judged — an asserted origin, honestly labeled, is
// still a valid source_system.
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

// POST /api/institutions/:institutionId/value-outcomes — creates, in one
// transaction, an engagement if none is named, a business metric if it does
// not already exist, and a value outcome linking a capability to that metric
// with a baseline. The middle of the value spine: baseline, attach, model.
export function valueOutcomesRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  router.post('/:institutionId/value-outcomes', async (req, res) => {
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

      const engagementId = optionalUuidString(body, 'engagement_id', 'body');
      let engagementName: string | undefined;
      let engagementOwnerPersonId: string | undefined;
      if (engagementId === undefined) {
        engagementName = requireString(body, 'engagement_name', 'body');
        engagementOwnerPersonId = requireUuidString(body, 'engagement_owner_person_id', 'body');
      }

      const metricInput = requireObject(body.metric, 'body.metric');
      const metricName = requireString(metricInput, 'name', 'body.metric');
      const metricUnit = requireString(metricInput, 'unit', 'body.metric');
      const metricDirection = requireString(metricInput, 'direction', 'body.metric');
      const metricSourceSystem = requireSourceSystem(metricInput, 'source_system', 'body.metric');
      const metricOwnerPersonId = optionalUuidString(metricInput, 'owner_person_id', 'body.metric');
      const metricReportingCadence = optionalNullableString(metricInput, 'reporting_cadence', 'body.metric');
      const metricDefinitionNotes = optionalNullableString(metricInput, 'definition_notes', 'body.metric');

      const capabilityName = requireString(body, 'capability_name', 'body');
      const baselineValue = requireNumber(body, 'baseline_value', 'body');
      const baselineMeasuredAt = requireTimestamp(body, 'baseline_measured_at', 'body');
      const targetValue = optionalNumber(body, 'target_value', 'body') ?? null;

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [institution] } = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM institutions WHERE id = $1 AND deleted_at IS NULL',
        [institutionId],
      );
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
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

      let engagementIdResolved: string;
      let engagementCreated: boolean;
      if (engagementId !== undefined) {
        const { rows: [engagement] } = await client.query<{ id: string; institution_id: string }>(
          'SELECT id, institution_id FROM engagements WHERE id = $1 AND deleted_at IS NULL',
          [engagementId],
        );
        if (!engagement) {
          res.status(422).json({ message: `engagement_id not found: ${engagementId}` });
          return;
        }
        if (engagement.institution_id !== institutionId) {
          res.status(422).json({
            message: `engagement_id ${engagementId} does not belong to institution ${institutionId}`,
          });
          return;
        }
        engagementIdResolved = engagement.id;
        engagementCreated = false;
      } else {
        const { rows: [owner] } = await client.query<{ id: string }>(
          `SELECT id FROM persons
            WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL`,
          [engagementOwnerPersonId, institutionId],
        );
        if (!owner) {
          res.status(422).json({
            message: `engagement_owner_person_id does not belong to institution ${institutionId}, or is simulated: ${engagementOwnerPersonId}`,
          });
          return;
        }
        const { rows: [engagement] } = await client.query<{ id: string }>(
          `INSERT INTO engagements (tenant_id, institution_id, name, owner_person_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [institution.tenant_id, institutionId, engagementName, engagementOwnerPersonId],
        );
        engagementIdResolved = engagement.id;
        engagementCreated = true;
      }

      let businessMetricId: string;
      let metricCreated: boolean;
      const { rows: [existingMetric] } = await client.query<{
        id: string;
        unit: string;
        direction: string;
        source_system: string;
      }>(
        // superseded_by_id IS NULL resolves to the CURRENT metric only.
        // Without it, once a metric has been superseded (validateMetric.ts),
        // this lookup matches both the ancestor and the successor — same
        // institution_id, same name, both deleted_at IS NULL — and returns
        // whichever one Postgres happens to pick. A new value outcome could
        // silently attach to a superseded metric with nothing to catch it.
        `SELECT id, unit, direction, source_system FROM business_metrics
          WHERE institution_id = $1 AND name = $2
            AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [institutionId, metricName],
      );
      if (existingMetric) {
        // Found is not update. A metric's source_system is its provenance:
        // silently discarding a mismatched payload would let a caller
        // attach an outcome to a metric whose origin is not what they
        // believe it to be — the exact failure the NOT NULL on
        // source_system exists to prevent. Refusing is the only safe
        // option here. Updating rewrites provenance; ignoring conceals it.
        const mismatches: Array<{ field: string; existing: string; submitted: string }> = [];
        if (existingMetric.unit !== metricUnit) {
          mismatches.push({ field: 'unit', existing: existingMetric.unit, submitted: metricUnit });
        }
        if (existingMetric.direction !== metricDirection) {
          mismatches.push({ field: 'direction', existing: existingMetric.direction, submitted: metricDirection });
        }
        if (existingMetric.source_system !== metricSourceSystem) {
          mismatches.push({
            field: 'source_system',
            existing: existingMetric.source_system,
            submitted: metricSourceSystem,
          });
        }
        if (mismatches.length > 0) {
          res.status(409).json({
            message: `business metric "${metricName}" already exists for this institution with different values: ${mismatches
              .map((m) => m.field)
              .join(', ')}`,
            mismatches,
          });
          return;
        }
        businessMetricId = existingMetric.id;
        metricCreated = false;
      } else {
        const { rows: [metric] } = await client.query<{ id: string }>(
          `INSERT INTO business_metrics (
             institution_id, name, unit, direction, source_system,
             owner_person_id, reporting_cadence, definition_notes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            institutionId, metricName, metricUnit, metricDirection, metricSourceSystem,
            metricOwnerPersonId ?? null, metricReportingCadence, metricDefinitionNotes,
          ],
        );
        businessMetricId = metric.id;
        metricCreated = true;
      }

      // Capabilities are not created here — they arrive by attaching an
      // offering. A value outcome against a capability nobody attached is a
      // naming error, not a gap to paper over with an implicit create.
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
          message: `capability not found for this institution: ${capabilityName}`,
        });
        return;
      }

      // value_stage 'baseline', realization 'claimed', confidence 'low',
      // source_verified false are the column defaults, restated explicitly
      // here rather than left implicit: this call only ever produces a
      // freshly baselined outcome. target/actual/impact/verification fields
      // are left NULL on purpose — the five CHECK constraints on this table
      // govern the walk from here, and belong to later calls, not this one.
      const { rows: [valueOutcome] } = await client.query<{ id: string }>(
        `INSERT INTO value_outcomes (
           engagement_id, institution_id, capability_id, business_metric_id,
           value_stage, baseline_value, baseline_measured_at, target_value,
           realization, confidence, source_verified
         )
         VALUES ($1, $2, $3, $4, 'baseline', $5, $6, $7, 'claimed', 'low', false)
         RETURNING id`,
        [
          engagementIdResolved, institutionId, capability.id, businessMetricId,
          baselineValue, baselineMeasuredAt, targetValue,
        ],
      );

      res.status(201).json({
        engagement_id: engagementIdResolved,
        engagement_created: engagementCreated,
        business_metric_id: businessMetricId,
        business_metric_created: metricCreated,
        value_outcome_id: valueOutcome.id,
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
