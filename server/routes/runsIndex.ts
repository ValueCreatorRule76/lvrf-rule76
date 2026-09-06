import { Router } from 'express';
import type { Pool } from 'pg';

// Global list across all engagements/institutions. Kept separate from
// runsRouter (server/routes/runs.ts) rather than added there, so that
// file's single-row-by-id shape stays untouched. Mounted at the same
// '/api/runs' base as runsRouter — this router only ever matches the
// bare '/', runsRouter only ever matches '/:id', so the two don't collide.
export function runsIndexRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      // LEFT JOIN, not JOIN — a run whose engagement or institution has
      // since been soft-deleted still belongs in this list; it renders
      // with institution_id/institution_name null rather than vanishing
      // from a global run index because something downstream of it was
      // retired. The deleted_at filters stay in the ON clauses (not
      // WHERE), which is what keeps that a LEFT JOIN in practice and not
      // an inner join wearing a LEFT JOIN keyword.
      const { rows } = await pool.query(`
        SELECT
          vr.id,
          i.id AS institution_id,
          i.name AS institution_name,
          vr.run_number,
          vr.terminal_value_stage,
          vr.confidence_score,
          vr.confidence_band,
          vr.institutional_health,
          vr.health_band,
          vr.health_coverage_pct,
          vr.source_fixture,
          vr.locked_at,
          vr.walked_at
        FROM value_runs vr
        LEFT JOIN engagements e ON e.id = vr.engagement_id AND e.deleted_at IS NULL
        LEFT JOIN institutions i ON i.id = e.institution_id AND i.deleted_at IS NULL
        WHERE vr.deleted_at IS NULL
        ORDER BY vr.walked_at DESC
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
