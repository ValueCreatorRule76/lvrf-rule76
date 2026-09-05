import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

/**
 * LVRF 2.0 item 5, industry packs — the read side. Two GET routes: every
 * industry for the actor's tenant with a measure count, and one industry's
 * full pack by slug.
 *
 * BOTH ARE READS — actorContext (server/middleware/actorContext.ts) only
 * opens a transaction and sets req.dbClient for MUTATING_METHODS; it
 * returns early on GET. So this queries the pool directly (same as
 * persons.ts, gapRegister.ts, runsIndex.ts), and — unlike those three,
 * which are either global or scoped by an id already in the URL — this
 * file has to resolve the actor's tenant itself, by hand, because nothing
 * upstream validates the actor header on a GET the way it does on a write.
 *
 * TENANT-SCOPED, NOT GLOBAL. This is a vendor's own view of its own packs,
 * not a cross-tenant listing — the same tenant resolution
 * industryResearch.ts's parse route uses: a vendor-side actor's own
 * tenant_id, or a customer-side actor's institution's tenant_id. Missing or
 * invalid X-Actor-Person-Id is a 422 here, same status actorContext uses
 * for the equivalent failure on a write, even though no middleware enforces
 * it on this path.
 */

// Shared by both routes below. Writes the 422 itself and returns null so
// the caller's handler can just `if (tenantId === null) return;` — the
// same header validation actorContext.ts performs for mutating requests,
// reimplemented here because GET never reaches that middleware's checks.
async function resolveActorTenantId(
  pool: Pool,
  req: Request,
  res: Response,
): Promise<string | null> {
  const actorPersonId = req.get('x-actor-person-id');
  if (!actorPersonId) {
    res.status(422).json({
      message: 'X-Actor-Person-Id header is required to resolve a tenant scope.',
    });
    return null;
  }
  if (!isUuid(actorPersonId)) {
    res.status(422).json({ message: 'X-Actor-Person-Id is not a valid UUID.' });
    return null;
  }

  const { rows: [actor] } = await pool.query<{ tenant_id: string | null }>(
    `SELECT COALESCE(p.tenant_id, i.tenant_id) AS tenant_id
       FROM persons p
       LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [actorPersonId],
  );
  if (!actor || !actor.tenant_id) {
    res.status(422).json({ message: 'Actor is not a person of record.' });
    return null;
  }
  return actor.tenant_id;
}

export function industryPackRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/industries — every industry for the actor's tenant, with a
  // measure count. LEFT JOIN + COUNT(...) FILTER means an industry with no
  // measures yields a row with measure_count = 0, not an omitted row — the
  // honest state (seven of ten empty today) has to be visible, not
  // filtered away as if it were absence of data rather than data.
  // COUNT(...)::int — Postgres COUNT is bigint, which node-pg returns as a
  // string; cast so the client gets a number, same convention as
  // gapRegister.ts's `count(*)::int AS n`.
  router.get('/', async (req, res) => {
    try {
      const tenantId = await resolveActorTenantId(pool, req, res);
      if (tenantId === null) return;

      const { rows } = await pool.query(
        `SELECT
           ind.id,
           ind.name,
           ind.slug,
           COUNT(im.id) FILTER (
             WHERE im.deleted_at IS NULL AND im.superseded_by_id IS NULL
           )::int AS measure_count
         FROM industries ind
         LEFT JOIN industry_measures im ON im.industry_id = ind.id
        WHERE ind.tenant_id = $1
        GROUP BY ind.id, ind.name, ind.slug
        ORDER BY ind.name`,
        [tenantId],
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  // GET /api/industries/:slug/pack — by SLUG, not id. This is a URL a
  // person will type or forward to a colleague; /packs/manufacturing is
  // legible where a uuid is not. 404 covers both "no such slug" and "slug
  // exists for a different tenant" identically, same reasoning as the
  // parse route's industry lookup in industryResearch.ts.
  //
  // deleted_at IS NULL AND superseded_by_id IS NULL on industry_measures —
  // a governed row resolved by something other than its primary key must
  // filter the supersession chain itself; nothing does it implicitly.
  // industries carries neither column (see db/schema.ts — it is not a
  // fully governed table), so the industry lookup itself has no such filter.
  //
  // An industry with zero measures still returns 200 with measures: [] —
  // an empty pack is a real state, not an error.
  router.get('/:slug/pack', async (req, res) => {
    try {
      const tenantId = await resolveActorTenantId(pool, req, res);
      if (tenantId === null) return;

      const slug = req.params.slug;

      const { rows: [industry] } = await pool.query<{ id: string; name: string; slug: string }>(
        `SELECT id, name, slug FROM industries WHERE slug = $1 AND tenant_id = $2`,
        [slug, tenantId],
      );
      if (!industry) {
        res.status(404).json({ message: `industry '${slug}' not found` });
        return;
      }

      // addressable DESC, then name — what can be claimed comes first.
      const { rows: measures } = await pool.query(
        `SELECT name, unit, direction, definition, why_it_pays, addressable,
                addressable_reasoning, confounders, citation, status
           FROM industry_measures
          WHERE industry_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY addressable DESC, name`,
        [industry.id],
      );

      res.json({ industry, measures });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
