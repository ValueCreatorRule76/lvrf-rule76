import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * P2 (LVRF_PLAN §10; design §2.4, §4; P2-D1, D2, D7) — GET /api/lineage/:table/:id
 * "Where did this come from": the steps of lvrf_lineage (hardening.sql section
 * 27), read-only. Tenant-scoped like every read: a row of another tenant is
 * "not found", and the mismatch is logged (isOtherTenant).
 *
 * Tables: institution_facts, institution_entities, industry_measures, evidence,
 * and value_outcomes with ?figure=baseline|actual.
 */

const TABLES = ['institution_facts', 'institution_entities', 'industry_measures', 'evidence', 'value_outcomes'] as const;

export function lineageRouter(pool: Pool): Router {
  const router = Router();
  router.get('/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!(TABLES as readonly string[]).includes(table)) {
      res.status(404).json({ message: `lineage is traced for facts, entities, pack measures, evidence and an outcome's figure; not for ${table}` });
      return;
    }
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid id: ${id}` });
      return;
    }
    const figure = typeof req.query.figure === 'string' ? req.query.figure : null;
    if (table === 'value_outcomes' && figure !== 'baseline' && figure !== 'actual') {
      res.status(400).json({ message: "an outcome's lineage is of its baseline or its actual: add ?figure=baseline or ?figure=actual" });
      return;
    }
    try {
      const { rows: [t] } = await pool.query<{ tenant_id: string | null }>('SELECT lvrf_governed_row_tenant($1, $2) AS tenant_id', [table, id]);
      if (!t?.tenant_id || isOtherTenant(req, t.tenant_id, { table, id })) {
        res.status(404).json({ message: `${table} ${id} not found` });
        return;
      }
      const { rows: steps } = await pool.query(
        `SELECT step, kind, row_table, row_id, actor,
                to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, source, detail
           FROM lvrf_lineage($1, $2, $3)`,
        [table, id, table === 'value_outcomes' ? figure : null],
      );
      res.json({ table, id, figure: table === 'value_outcomes' ? figure : null, steps });
    } catch (err) {
      respondServerError(res, err);
    }
  });
  return router;
}
