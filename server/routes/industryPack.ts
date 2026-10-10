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
      // THE REVIEW TRAVELS WITH THE MEASURE. A pack entry exists only
      // because a person accepted a research result (researchResultsReview,
      // industryResearch.ts), and their review_note is where a caveat raised
      // at review lives — a caveat the research itself may not have written
      // into the citation. Before this join the page showed the measure's
      // own columns only, so a reviewer's "confirm this threshold before
      // relying on it" was invisible to the account manager reading the
      // pack. LEFT JOIN, and `review` is null when no accepted result points
      // at the measure: every entry reachable today has one, but a null says
      // "no review on record" rather than inventing one.
      const { rows } = await pool.query<{
        name: string; unit: string; direction: string; definition: string;
        why_it_pays: string; addressable: boolean; addressable_reasoning: string;
        confounders: string; citation: string; status: string;
        review_note: string | null; reviewed_at: string | null; reviewed_by: string | null;
        research_tool: string | null; parsed_at: string | null;
      }>(
        `SELECT im.name, im.unit, im.direction, im.definition, im.why_it_pays, im.addressable,
                im.addressable_reasoning, im.confounders, im.citation, im.status,
                rr.review_note, rr.reviewed_at, reviewer.full_name AS reviewed_by,
                rr.research_tool, rr.parsed_at
           FROM industry_measures im
           LEFT JOIN research_results rr
                  ON rr.industry_measures_id = im.id AND rr.review_state = 'accepted'
           LEFT JOIN persons reviewer ON reviewer.id = rr.reviewed_by_person_id
          WHERE im.industry_id = $1 AND im.deleted_at IS NULL AND im.superseded_by_id IS NULL
          ORDER BY im.addressable DESC, im.name`,
        [industry.id],
      );

      const measures = rows.map(({ review_note, reviewed_at, reviewed_by, research_tool, parsed_at, ...m }) => ({
        ...m,
        review: reviewed_at === null
          ? null
          : { note: review_note, reviewed_by, reviewed_at, research_tool, parsed_at },
      }));

      // Tested and excluded (industryExclusions.ts): measures a person
      // judged do not belong in this pack at all. Returned beside the pack
      // so the page can show what was considered and set aside — the same
      // reason the table exists: so the same wrong proposal is not made
      // twice. The research's proposal, when there was one, travels
      // separately from the person's reason, as it is stored.
      const { rows: exclusions } = await pool.query(
        `SELECT x.name, x.reason, x.citation, x.excluded_at,
                p.full_name AS excluded_by,
                x.proposed_by_research_tool, x.proposal_text
           FROM industry_measure_exclusions x
           JOIN persons p ON p.id = x.excluded_by_person_id
          WHERE x.industry_id = $1
          ORDER BY x.name`,
        [industry.id],
      );

      res.json({ industry, measures, exclusions });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
