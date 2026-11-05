import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * §16 (LVRF_PLAN; CS-D1–D6) — GET /api/engagements/:id/snapshots: every run of an engagement, oldest first, each with
 * what it sealed: its score and band, model, hash, figures, errata and mark, and its case (payloadVersion 4) or the
 * fact that it sealed none. A read; it persists nothing. Unlike GET /api/engagements/:id/runs it reads a retired
 * engagement too, because a retired engagement's runs stay on the record.
 */
export function snapshotsRouter(pool: Pool): Router {
  const router = Router();
  router.get('/:id/snapshots', async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid engagement id: ${id}` }); return; }
    try {
      const { rows: [eng] } = await pool.query<{ id: string; tenant_id: string; name: string; institution_id: string; account: string; retired: boolean; is_tenant_self: boolean }>(
        `SELECT g.id, g.tenant_id, g.name, g.institution_id, i.name AS account, (g.deleted_at IS NOT NULL OR g.superseded_by_id IS NOT NULL) AS retired, i.is_tenant_self
           FROM engagements g JOIN institutions i ON i.id = g.institution_id WHERE g.id = $1`, [id]);
      if (!eng || isOtherTenant(req, eng.tenant_id, { table: 'engagements', id })) { res.status(404).json({ message: `engagement ${id} not found` }); return; }
      const { rows: [marker] } = await pool.query(
        `SELECT kind, source_citation FROM reference_example_markers WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`, [eng.institution_id]);
      const { rows: runs } = await pool.query(
        `SELECT r.id, r.run_number, r.locked_at, (SELECT full_name FROM persons WHERE id = r.locked_by_person_id) AS locked_by, r.lock_reason,
                r.confidence_score::float AS score, r.confidence_band AS band, r.terminal_value_stage AS stage, r.payload_hash, r.superseded_by_id,
                coalesce((r.payload->>'payloadVersion')::int, 1) AS payload_version,
                r.payload->>'valueOutcomeId' AS value_outcome_id, r.payload->>'realization' AS realization,
                r.payload->'baselineValue' AS baseline_value, r.payload->'targetValue' AS target_value, r.payload->'actualValue' AS actual_value,
                coalesce(r.payload->'businessMetric'->>'name', r.payload->>'businessMetric') AS metric,
                r.payload->'confidence'->>'modelVersion' AS model_version, r.payload->'confidence'->>'modelFingerprint' AS model_fingerprint,
                lvrf_run_erratum_line(r.id) AS erratum_line,
                -- CS-D5: an erratum's recomputed score only where the erratum recorded one; never derived.
                coalesce((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'recomputed_score', x.recomputed_score::float) ORDER BY x.recorded_at)
                            FROM run_errata x WHERE x.value_run_id = r.id AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)), '[]'::jsonb) AS errata,
                lvrf_system_exercise_mark('value_runs', r.id) AS system_exercise,
                r.payload->'case' AS "case"
           FROM value_runs r WHERE r.engagement_id = $1 AND r.deleted_at IS NULL ORDER BY r.run_number`, [id]);
      res.json({ engagement: { id: eng.id, name: eng.name, account: eng.account, institution_id: eng.institution_id, retired: eng.retired, is_tenant_self: eng.is_tenant_self },
        reference_example: marker ?? null, runs });
    } catch (err) {
      respondServerError(res, err);
    }
  });
  return router;
}
