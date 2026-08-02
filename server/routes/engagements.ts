import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

export function engagementsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          e.id,
          e.name,
          i.name AS institution_name,
          t.name AS tenant_name,
          e.value_stage,
          e.renewal_date,
          count(vr.id)::int AS run_count,
          max(vr.walked_at) AS most_recent_run_at
        FROM engagements e
        JOIN institutions i ON i.id = e.institution_id AND i.deleted_at IS NULL
        JOIN tenants t ON t.id = e.tenant_id AND t.deleted_at IS NULL
        LEFT JOIN value_runs vr ON vr.engagement_id = e.id AND vr.deleted_at IS NULL
        WHERE e.deleted_at IS NULL
        GROUP BY e.id, e.name, i.name, t.name, e.value_stage, e.renewal_date
        ORDER BY most_recent_run_at DESC NULLS LAST
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  // Nested under the engagement it belongs to, per the actual FK: value_runs.engagement_id
  // is a direct reference, not routed through value_outcomes.
  router.get('/:id/runs', async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(400).json({ message: `invalid engagement id: ${req.params.id}` });
      return;
    }
    try {
      const { rows: [engagement] } = await pool.query(
        `SELECT id FROM engagements WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (!engagement) {
        res.status(404).json({ message: `engagement ${req.params.id} not found` });
        return;
      }

      const { rows } = await pool.query(
        `SELECT
           run_number,
           terminal_value_stage,
           confidence_score,
           confidence_band,
           institutional_health,
           health_band,
           health_coverage_pct,
           locked_at,
           source_fixture,
           walked_at
         FROM value_runs
        WHERE engagement_id = $1 AND deleted_at IS NULL
        ORDER BY run_number DESC`,
        [req.params.id],
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
