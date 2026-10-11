import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { actorTenantId, isOtherTenant } from '../lib/tenantScope.js';

// GET /api/persons — the people who may act or attest, for a browser to
// select from. Sign-in P3: only the actor's tenant's people — its staff,
// and the people of its accounts. Nothing has exposed this before now; the
// actor id has only ever been supplied by hand on a command line.
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
      // An institution_id of another tenant answers exactly as an unknown
      // one does — an empty list — and is logged.
      if (institutionId !== undefined) {
        const { rows: [inst] } = await pool.query<{ tenant_id: string }>(
          'SELECT tenant_id FROM institutions WHERE id = $1',
          [institutionId],
        );
        if (inst && isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
          res.json([]);
          return;
        }
      }

      const conditions: string[] = ['p.deleted_at IS NULL'];
      // Governed rows resolved by something other than a primary key must
      // filter the supersession chain.
      conditions.push('p.superseded_by_id IS NULL');

      // A person's tenant is their own (staff) or their institution's
      // (customer side) — persons_scoped_to_exactly_one.
      const params: string[] = [actorTenantId(req)];
      conditions.push('COALESCE(p.tenant_id, scope.tenant_id) = $1');
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
         LEFT JOIN institutions scope ON scope.id = p.institution_id
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
