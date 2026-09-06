import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

export function runsRouter(pool: Pool): Router {
  const router = Router();

  // Full row, payload included, unreshaped. render_record.py and the workbench
  // read the same jsonb object stored at walk time — no transformation layer
  // here for them to silently diverge across.
  //
  // vr.* also returns steward_person_id, version, superseded_by_id, and
  // other governance columns the workbench has no use for. Fine while nothing
  // here is customer data; once auth lands and payloads carry real customer
  // content, this should become an explicit column list rather than whatever
  // governance() happens to add to value_runs next.
  //
  // institution_id/institution_name are new — the owner join, same path
  // runsIndex.ts uses. LEFT JOIN, not JOIN: this endpoint's whole contract
  // is "return this run if it exists," and an INNER join would turn a run
  // whose engagement or institution was later soft-deleted into a 404 for
  // an id that is very much still there. Null here means exactly that —
  // never substitute the engagement name or anything else in its place.
  router.get('/:id', async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(400).json({ message: `invalid run id: ${req.params.id}` });
      return;
    }
    try {
      const { rows: [run] } = await pool.query(
        `SELECT vr.*, i.id AS institution_id, i.name AS institution_name
           FROM value_runs vr
           LEFT JOIN engagements e ON e.id = vr.engagement_id AND e.deleted_at IS NULL
           LEFT JOIN institutions i ON i.id = e.institution_id AND i.deleted_at IS NULL
          WHERE vr.id = $1 AND vr.deleted_at IS NULL`,
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
