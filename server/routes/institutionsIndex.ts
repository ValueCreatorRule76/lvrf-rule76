import { Router } from 'express';
import type { Pool } from 'pg';

// GET /api/institutions — the accounts index, the front door's own data.
// Same shape as runsIndex.ts: a flat, unscoped list — no actor header, no
// filter, no pagination. Mounted before the other /api/institutions
// routers (all of which match a sub-path, never the bare '/'), the same
// relationship runsIndex.ts has to runsRouter.
//
// COMPUTES NOTHING BEYOND WHAT IS SELECTED. institutionView.ts just
// consolidated the gap into one server-side answer for ONE account — a
// summary column here (an unmeasured count, coverage, anything derived)
// would be a second implementation of that same rule, evaluated across
// EVERY account, in a place where the two silently drifting apart would
// be far harder to notice than it was on a single account's own page. If
// a future page needs a richer row, the server returns it there; this
// route does not grow one on spec.
export function institutionsIndexRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      // LEFT JOIN industries — an unclassified institution (industry_id
      // IS NULL) must return industry_name: null, not an omitted row and
      // not a placeholder string. LEFT JOIN engagements — an institution
      // with none still returns engagement_count: 0, not an omitted row;
      // COUNT(e.id), not COUNT(*), so the outer join's own null-row
      // doesn't get counted as one engagement.
      const { rows } = await pool.query(`
        SELECT
          i.id,
          i.name,
          ind.name AS industry_name,
          COUNT(e.id) FILTER (WHERE e.deleted_at IS NULL)::int AS engagement_count
        FROM institutions i
        LEFT JOIN industries ind ON ind.id = i.industry_id
        LEFT JOIN engagements e ON e.institution_id = i.id
        WHERE i.deleted_at IS NULL
        GROUP BY i.id, i.name, ind.name
        ORDER BY i.name
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
