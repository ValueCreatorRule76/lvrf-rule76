import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

export function runsRouter(pool: Pool): Router {
  const router = Router();

  // Full row, payload included, unreshaped. render_record.py and the workbench
  // read the same jsonb object stored at walk time — no transformation layer
  // here for them to silently diverge across.
  //
  // SELECT * also returns steward_person_id, version, superseded_by_id, and
  // other governance columns the workbench has no use for. Fine while nothing
  // here is customer data; once auth lands and payloads carry real customer
  // content, this should become an explicit column list rather than whatever
  // governance() happens to add to value_runs next.
  router.get('/:id', async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(400).json({ message: `invalid run id: ${req.params.id}` });
      return;
    }
    try {
      const { rows: [run] } = await pool.query(
        `SELECT * FROM value_runs WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (!run) {
        res.status(404).json({ message: `run ${req.params.id} not found` });
        return;
      }
      res.json(run);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
