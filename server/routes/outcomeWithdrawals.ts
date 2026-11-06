import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct } from '../lib/governanceAct.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isUuid } from './params.js';

/**
 * B4 (LVRF_PLAN §14; D3, Brad 5 Nov 2026) — the steward withdraws a measurement or a commitment, with a reason:
 *
 *   POST /api/value-outcomes/:outcomeId/measurement/withdraw   the actual, when it was measured, any realized impact
 *   POST /api/value-outcomes/:outcomeId/commitment/withdraw    the target, its committer and date, the method and class
 *
 * The values withdrawn are written first to outcome_withdrawals, exactly as the outcome held them, and the outcome then
 * steps back (a measured outcome reads committed again; a committed one reads claimed). Hardening §34 refuses the step
 * back without that row in the same transaction, a verified measurement's withdrawal, and a commitment withdrawn while a
 * measurement stands. No sealed run changes.
 */
class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const MIN_REASON = 12;

export function outcomeWithdrawalsRouter(pool: Pool): Router {
  const router = Router();

  // One handler for both; each route written out, so scripts/list_api_routes.mjs reads it.
  const withdraw = (kind: 'measurement' | 'commitment') => async (req: Request<{ outcomeId: string }>, res: Response) => {
    const endpoint = `POST /api/value-outcomes/:outcomeId/${kind}/withdraw`;
    {
      const client: PoolClient = req.dbClient!;
      const { outcomeId } = req.params;
      let tenantId: string | null = null;
      let institutionId: string | null = null;
      const ctx = () => ({ endpoint, subjectTable: 'value_outcomes', subjectId: outcomeId, tenantId, institutionId });
      if (!isUuid(outcomeId)) { res.status(400).json({ message: `invalid value outcome id: ${outcomeId}` }); return; }
      try {
        const { rows: [o] } = await client.query<{
          tenant_id: string; institution_id: string; engagement_retired: boolean; actual_value: string | null; actual_measured_at: string | null;
          realized_currency_impact: string | null; verified_at: string | null; target_value: string | null; committed_at: string | null;
          committed_by: string | null; committed_by_person_id: string | null; attribution_method: string | null; measure_class: string | null;
          realization: string; value_stage: string;
        }>(
          `SELECT i.tenant_id, vo.institution_id, (g.deleted_at IS NOT NULL) AS engagement_retired,
                  trim_scale(vo.actual_value)::text AS actual_value, to_char(vo.actual_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS actual_measured_at,
                  trim_scale(vo.realized_currency_impact)::text AS realized_currency_impact, vo.verified_at,
                  trim_scale(vo.target_value)::text AS target_value, to_char(vo.committed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS committed_at,
                  (SELECT full_name FROM persons WHERE id = vo.committed_by_person_id) AS committed_by, vo.committed_by_person_id,
                  vo.attribution_method, vo.measure_class, vo.realization, vo.value_stage
             FROM value_outcomes vo JOIN institutions i ON i.id = vo.institution_id JOIN engagements g ON g.id = vo.engagement_id
            WHERE vo.id = $1 AND vo.deleted_at IS NULL`, [outcomeId]);
        if (!o || isOtherTenant(req, o.tenant_id, { table: 'value_outcomes', id: outcomeId })) {
          res.status(404).json({ message: `value outcome ${outcomeId} not found` }); return;
        }
        tenantId = o.tenant_id; institutionId = o.institution_id;
        if (await refuseUnknownFields(pool, req, res, ['reason'], { ...ctx(), tenantId })) return;
        const reason = typeof (req.body as Record<string, unknown>)?.reason === 'string' ? ((req.body as Record<string, string>).reason).trim() : '';
        if (o.engagement_retired) throw new Refusal(409, 'This outcome belongs to a retired engagement: its outcomes are frozen.');
        if (reason.length < MIN_REASON) throw new Refusal(422, `Say why it is withdrawn, in at least ${MIN_REASON} characters.`);
        let values: Record<string, unknown>;
        if (kind === 'measurement') {
          if (o.actual_value === null) throw new Refusal(409, 'There is no measurement to withdraw.');
          if (o.verified_at !== null) throw new Refusal(409, 'A verified measurement is never withdrawn.');
          values = { actual_value: o.actual_value, actual_measured_at: o.actual_measured_at, realized_currency_impact: o.realized_currency_impact,
                     realization: o.realization, value_stage: o.value_stage };
        } else {
          if (o.committed_at === null) throw new Refusal(409, 'There is no commitment to withdraw.');
          if (o.actual_value !== null) throw new Refusal(409, 'Withdraw the measurement first: a commitment is withdrawn only once nothing is measured.');
          values = { target_value: o.target_value, committed_at: o.committed_at, committed_by: o.committed_by, committed_by_person_id: o.committed_by_person_id,
                     attribution_method: o.attribution_method, measure_class: o.measure_class, value_stage: o.value_stage };
        }
        const { rows: [w] } = await client.query<{ id: string }>(
          `INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [tenantId, outcomeId, kind, values, reason, req.actor!.personId]);
        if (kind === 'measurement') {
          await client.query(
            `UPDATE value_outcomes SET actual_value = NULL, actual_measured_at = NULL, realized_currency_impact = NULL, realization = 'claimed',
                    value_stage = CASE WHEN committed_at IS NOT NULL THEN 'commit'::value_stage ELSE value_stage END
              WHERE id = $1`, [outcomeId]);
          await recordAct(client, req, 'POST /api/value-outcomes/:outcomeId/measurement/withdraw', { act: 'withdraw', tenantId, subjectTable: 'value_outcomes', subjectId: outcomeId, resultTable: 'outcome_withdrawals', resultId: w.id, reason });
        } else {
          await client.query(
            `UPDATE value_outcomes SET target_value = NULL, committed_by_person_id = NULL, committed_at = NULL, attribution_method = NULL, measure_class = NULL,
                    value_stage = 'attach' WHERE id = $1`, [outcomeId]);
          await recordAct(client, req, 'POST /api/value-outcomes/:outcomeId/commitment/withdraw', { act: 'withdraw', tenantId, subjectTable: 'value_outcomes', subjectId: outcomeId, resultTable: 'outcome_withdrawals', resultId: w.id, reason });
        }
        res.status(200).json({ outcome_withdrawal_id: w.id, kind, withdrawn: values });
      } catch (err) {
        if (err instanceof Refusal) {
          if (tenantId) await recordRouteRefusal(pool, req, { ...ctx(), tenantId, attemptedPayload: req.body }, err.message);
          res.status(err.status).json({ message: err.message });
          return;
        }
        if (await handleGovernanceError(pool, err, req, res, { ...ctx(), attemptedPayload: req.body })) return;
        respondServerError(res, err);
      }
    }
  };
  router.post('/:outcomeId/measurement/withdraw', requireSteward(pool), withdraw('measurement'));
  router.post('/:outcomeId/commitment/withdraw', requireSteward(pool), withdraw('commitment'));
  return router;
}

/**
 * B4 (§14) — GET /api/institutions/:institutionId/outcome-spine: each current outcome of the account where it stands on
 * commit, measure and verify, for card 01d. A read; tenant-scoped; persists nothing.
 */
export function outcomeSpineRouter(pool: Pool): Router {
  const router = Router();
  router.get('/:institutionId/outcome-spine', async (req, res) => {
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: `invalid institution id: ${institutionId}` }); return; }
    try {
      const { rows: [inst] } = await pool.query<{ tenant_id: string }>('SELECT tenant_id FROM institutions WHERE id = $1 AND deleted_at IS NULL', [institutionId]);
      if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` }); return;
      }
      const { rows } = await pool.query(
        `SELECT vo.id, bm.name AS metric, bm.unit, bm.direction, g.name AS engagement, (g.deleted_at IS NOT NULL) AS engagement_retired,
                trim_scale(vo.baseline_value)::text AS baseline, trim_scale(vo.target_value)::text AS target,
                (SELECT full_name FROM persons WHERE id = vo.committed_by_person_id) AS committed_by,
                to_char(vo.committed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS committed_on, vo.attribution_method, vo.measure_class,
                trim_scale(vo.actual_value)::text AS actual, to_char(vo.actual_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS measured_on,
                trim_scale(vo.realized_currency_impact)::text AS realized, vo.currency_code AS currency, vo.realization,
                (SELECT full_name FROM persons WHERE id = vo.verified_by_person_id) AS verified_by,
                to_char(vo.verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS verified_on,
                EXISTS (SELECT 1 FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id
                         WHERE voe.value_outcome_id = vo.id AND voe.supports = 'actual' AND voe.withdrawn_at IS NULL
                           AND e.superseded_by_id IS NULL AND e.deleted_at IS NULL AND NOT e.simulated
                           AND lvrf_evidence_basis(e) IN ('system_of_record', 'client_stated', 'published')) AS admitted_actual_evidence
           FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id JOIN engagements g ON g.id = vo.engagement_id
          WHERE vo.institution_id = $1 AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
          ORDER BY g.created_at, vo.created_at`, [institutionId]);
      res.json({ outcomes: rows });
    } catch (err) { respondServerError(res, err); }
  });
  return router;
}

