import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 */

class ValidationError extends Error {}

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

// POST /api/business-metrics/:metricId/pack-basis — business_metrics.
// industry_measure_id has existed since migration 0019 and, until this
// route, had no writer at all: nothing in this codebase has ever set it.
// The link an account's own metric has to the industry's pack is a
// JUDGEMENT a person makes, not a fact that can be inferred from a shared
// name — this endpoint is that act, and it is the only writer of that
// column, same relationship institutionClassify.ts has to
// institutions.industry_id and capabilityClaims.ts has to
// capability_industry_measures.
//
// `basis_note` is required and NOT CONTENT-VALIDATED, for the same reason
// capabilityClaims.ts's `claim` isn't: no rule can tell a genuine
// instantiation from a coincidence. It matters BECAUSE an account metric
// sharing a pack measure's NAME is not proof they are the same number — a
// site computing lot acceptance over lots RELEASED, rather than lots
// STARTED, is measuring a different thing under the same label. This note
// is where a person states why this metric counts as this measure; that
// judgement is a REVIEW concern, not something this endpoint can check by
// rule.
export function metricPackBasisRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:metricId/pack-basis', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const metricId = req.params.metricId;
    if (!isUuid(metricId)) {
      res.status(400).json({ message: `invalid business metric id: ${metricId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record.
    let refusalTenantId: string | null = null;
    let refusalInstitutionId: string | null = null;

    try {
      const body = requireObject(req.body, 'body');
      const industryMeasureId = requireUuidString(body, 'industry_measure_id', 'body');
      const basisNote = requireString(body, 'basis_note', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      // current_measure_name is only populated if industry_measure_id is
      // already set — needed to name the existing basis in the 409 below
      // without a second round trip. institution_industry_name likewise
      // only populated if the institution is classified — needed to name
      // a precondition mismatch below. Filtered to a live, current metric:
      // soft-deleted and superseded metrics are both "missing" here, same
      // reasoning as capabilityClaims.ts's capability lookup.
      const { rows: [metric] } = await client.query<{
        id: string;
        name: string;
        institution_id: string;
        tenant_id: string;
        institution_name: string;
        industry_measure_id: string | null;
        current_measure_name: string | null;
        institution_industry_id: string | null;
        institution_industry_name: string | null;
      }>(
        `SELECT bm.id, bm.name, bm.institution_id, i.tenant_id, i.name AS institution_name,
                bm.industry_measure_id, cur.name AS current_measure_name,
                i.industry_id AS institution_industry_id, ind.name AS institution_industry_name
           FROM business_metrics bm
           JOIN institutions i ON i.id = bm.institution_id AND i.deleted_at IS NULL
           LEFT JOIN industries ind ON ind.id = i.industry_id
           LEFT JOIN industry_measures cur ON cur.id = bm.industry_measure_id
          WHERE bm.id = $1 AND bm.deleted_at IS NULL AND bm.superseded_by_id IS NULL`,
        [metricId],
      );
      if (!metric) {
        res.status(404).json({ message: `business metric ${metricId} not found` });
        return;
      }
      refusalTenantId = metric.tenant_id;
      refusalInstitutionId = metric.institution_id;

      // A basis is not amended silently — same reasoning as
      // institutionClassify.ts's 409 and capabilityClaims.ts's 409: a
      // second basis supersedes the METRIC, it does not overwrite this
      // one's industry_measure_id.
      if (metric.industry_measure_id !== null) {
        res.status(409).json({
          message:
            `business metric ${metricId} already has a pack basis: ` +
            `${metric.current_measure_name}; a basis is not amended — supersede the metric instead`,
        });
        return;
      }

      // Filtered to a live, current measure — soft-deleted and superseded
      // industry measures are both "missing" here, same reasoning as
      // capabilityClaims.ts's measure lookup.
      const { rows: [measure] } = await client.query<{
        id: string;
        name: string;
        industry_id: string;
        industry_name: string;
      }>(
        `SELECT im.id, im.name, im.industry_id, ind.name AS industry_name
           FROM industry_measures im
           JOIN industries ind ON ind.id = im.industry_id
          WHERE im.id = $1 AND im.deleted_at IS NULL AND im.superseded_by_id IS NULL`,
        [industryMeasureId],
      );
      if (!measure) {
        res.status(404).json({ message: `industry measure ${industryMeasureId} not found` });
        return;
      }

      // THE PRECONDITION, same shape as capabilityClaims.ts: an account
      // metric cannot instantiate a measure from a pack its own
      // institution isn't classified into. Two distinct failures, named
      // separately, because they have different remedies: classify the
      // institution, versus this measure is simply the wrong pack for
      // this account.
      if (metric.institution_industry_id === null) {
        res.status(422).json({
          message:
            `institution ${metric.institution_name} is not classified into any industry; ` +
            `classify it (POST /api/institutions/:institutionId/industry) before one of its ` +
            `metrics can carry a pack basis`,
        });
        return;
      }
      if (metric.institution_industry_id !== measure.industry_id) {
        res.status(422).json({
          message:
            `institution ${metric.institution_name} is classified into ` +
            `${metric.institution_industry_name}, not ${measure.industry_name} — the industry ` +
            `that owns industry measure ${measure.name}`,
        });
        return;
      }

      // actorContext already confirmed this id names a real, non-simulated
      // person before calling next() — this lookup is only for a readable
      // name in the provenance text, not another authorization check.
      const { rows: [actorPerson] } = await client.query<{ full_name: string }>(
        'SELECT full_name FROM persons WHERE id = $1',
        [actorPersonId],
      );

      // basis_note as an evidence row, mirroring institutionClassify.ts's
      // classification_note write exactly — same shape, same reasoning:
      // this is a person's stated judgement, not a sourced fact, and the
      // record says so honestly.
      const { rows: [evidenceRow] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id
         ) VALUES ($1, 'observation', $2, $3, 'low', false, false, false, $4)
         RETURNING id`,
        [
          metric.institution_id,
          basisNote,
          `Asserted at pack basis by ${actorPerson.full_name}`,
          actorPersonId,
        ],
      );

      // Race guard, same shape as institutionClassify.ts's: if another
      // request set this metric's basis between the SELECT above and this
      // UPDATE, zero rows come back instead of silently overwriting
      // whoever won.
      const { rows: [updated] } = await client.query<{ industry_measure_id: string }>(
        `UPDATE business_metrics
            SET industry_measure_id = $1
          WHERE id = $2 AND industry_measure_id IS NULL
          RETURNING industry_measure_id`,
        [measure.id, metricId],
      );
      if (!updated) {
        res.status(409).json({
          message: `business metric ${metricId} had a pack basis set by another request just now; retry to see the current basis`,
        });
        return;
      }

      res.status(201).json({
        metric_id: metricId,
        metric_name: metric.name,
        industry_measure_id: measure.id,
        measure_name: measure.name,
        industry_name: measure.industry_name,
        evidence_id: evidenceRow.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // — or a unique-constraint collision (ERRCODE unique_violation,
      // SQLSTATE 23505) — is the governance gate doing its job, not a
      // server fault. Its message goes to the caller unchanged, not
      // swallowed into a generic 500. handleGovernanceError also records
      // the attempt — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/business-metrics/:metricId/pack-basis',
        subjectTable: 'business_metrics',
        subjectId: metricId,
        tenantId: refusalTenantId,
        institutionId: refusalInstitutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
