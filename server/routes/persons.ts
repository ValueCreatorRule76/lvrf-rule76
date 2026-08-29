import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

// GET /api/persons — the people who may act or attest, for a browser to
// select from. Nothing has exposed this before now; the actor id has only
// ever been supplied by hand on a command line.
//
// This is a read: actorContext returns early for non-mutating methods and
// never sets req.dbClient on a GET, so this router queries the pool
// directly, same as runsIndexRouter.
export function personsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const institutionIdParam = req.query.institution_id;
    let institutionId: string | undefined;
    if (institutionIdParam !== undefined) {
      if (typeof institutionIdParam !== 'string' || !isUuid(institutionIdParam)) {
        res.status(400).json({ message: `invalid institution id: ${institutionIdParam}` });
        return;
      }
      institutionId = institutionIdParam;
    }

    // Defaults to false: a simulated person may not act or attest, and
    // returning them unmarked in a picker would let someone select one and
    // receive a refusal they cannot interpret.
    const includeSimulated = req.query.include_simulated === 'true';

    try {
      const conditions: string[] = ['p.deleted_at IS NULL'];
      // Governed rows resolved by something other than a primary key must
      // filter the supersession chain.
      conditions.push('p.superseded_by_id IS NULL');

      const params: string[] = [];
      if (institutionId !== undefined) {
        params.push(institutionId);
        conditions.push(`p.institution_id = $${params.length}`);
      }
      if (!includeSimulated) {
        conditions.push('p.simulated = false');
      }

      const { rows } = await pool.query(
        `SELECT
           p.id,
           p.full_name,
           p.email,
           p.title,
           p.institution_id,
           i.name AS institution_name,
           p.simulated
         FROM persons p
         LEFT JOIN institutions i ON i.id = p.institution_id AND i.deleted_at IS NULL
         WHERE ${conditions.join(' AND ')}
         ORDER BY i.name NULLS LAST, p.full_name`,
        params,
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
