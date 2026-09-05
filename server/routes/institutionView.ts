import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

/**
 * GET /api/institutions/:id/view — the account view. Everything the screen
 * where the pack and the account meet needs, in one call: the institution
 * (intake text AND classification, kept as two separate facts — see
 * db/schema.ts's industry/industryId comment), the industry's pack if
 * classified, the account's own business_metrics, its engagements, and a
 * run summary.
 *
 * THIS IS A READ — actorContext (server/middleware/actorContext.ts) only
 * opens a transaction and sets req.dbClient for MUTATING_METHODS; it
 * returns early on GET. So this queries the pool directly, same as
 * industryPack.ts, gapRegister.ts, persons.ts, runsIndex.ts.
 *
 * TENANT-SCOPED BY THE ACTOR, same reasoning and same helper shape as
 * industryPack.ts's resolveActorTenantId — duplicated here rather than
 * imported, because that function is industryPack.ts's own local helper,
 * not an exported one; this codebase has a documented habit of not
 * factoring out a second copy until a third one shows up (see
 * server/lib/refusal.ts's comment on isCheckViolation/isUniqueViolation,
 * which waited for TEN copies). One duplicate is not that yet.
 */
interface PackMeasureRow {
  id: string;
  name: string;
  unit: string;
  direction: string;
  addressable: boolean;
  why_it_pays: string;
  status: string;
}

interface MetricRow {
  id: string;
  name: string;
  unit: string;
  direction: string;
  source_system: string;
  industry_measure_id: string | null;
}

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

export function institutionViewRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:id/view', async (req, res) => {
    const institutionId = req.params.id;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }

    try {
      const tenantId = await resolveActorTenantId(pool, req, res);
      if (tenantId === null) return;

      // tenant_id scoped in the WHERE, not checked afterward — 404 covers
      // "no such institution", "soft-deleted" and "belongs to another
      // tenant" identically, same reasoning as industryPack.ts's slug
      // lookup: a caller on the wrong tenant gets the same answer as a
      // caller with a typo, not a hint that the id exists elsewhere.
      const { rows: [institution] } = await pool.query<{
        id: string;
        name: string;
        industry: string | null;
        industry_id: string | null;
        is_tenant_self: boolean;
        industry_name: string | null;
        industry_slug: string | null;
      }>(
        `SELECT i.id, i.name, i.industry, i.industry_id, i.is_tenant_self,
                ind.name AS industry_name, ind.slug AS industry_slug
           FROM institutions i
           LEFT JOIN industries ind ON ind.id = i.industry_id
          WHERE i.id = $1 AND i.tenant_id = $2 AND i.deleted_at IS NULL`,
        [institutionId, tenantId],
      );
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }

      // NULL, not an empty pack, when unclassified — an account with no
      // industry_id has no pack to look up at all. This is the honest
      // "unclassified" state institutionClassify.ts's comment describes,
      // not the same shape as a classified industry that happens to have
      // zero measures (industryPack.ts's own "empty pack is real" case,
      // which still returns []).
      let pack: PackMeasureRow[] | null = null;
      if (institution.industry_id) {
        const { rows: measures } = await pool.query<PackMeasureRow>(
          `SELECT id, name, unit, direction, addressable, why_it_pays, status
             FROM industry_measures
            WHERE industry_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
            ORDER BY addressable DESC, name`,
          [institution.industry_id],
        );
        pack = measures;
      }

      // superseded_by_id IS NULL — resolved by institution_id, not a
      // primary key, so the supersession chain has to be filtered here,
      // same as every other non-PK business_metrics lookup in this codebase.
      // id is selected now (it wasn't before) — needed to key the gap join
      // below, and it is what metricPackBasis.ts's :metricId addresses.
      const { rows: metrics } = await pool.query<MetricRow>(
        `SELECT id, name, unit, direction, source_system, industry_measure_id
           FROM business_metrics
          WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY name`,
        [institutionId],
      );

      /**
       * THE GAP, computed here — not left for a caller to re-derive from
       * `pack` and `metrics` separately. Both sides key off the SAME FK,
       * business_metrics.industry_measure_id, checked here before this
       * change: nothing joined on anything ELSE — no name comparison, no
       * fuzzy match — this column simply had no writer anywhere in this
       * codebase (see metricPackBasis.ts), so every metric's
       * industry_measure_id was NULL. That is why an account metric named
       * the same as a pack measure could appear on BOTH sides at once: the
       * left list (industry_measure_id IS NULL) is correct for every row,
       * because every row's value genuinely was null; the right list
       * (addressable pack measures no metric points at) is ALSO correct
       * for every row, for the same reason. Two independently-correct
       * computations produced a jointly-false impression, because the one
       * fact that would have resolved it — a person's stated judgement
       * that this metric instantiates that measure — did not yet have
       * anywhere to be written. Fixing the join here would have changed
       * nothing while that fact stayed unwritable; the real fix is
       * metricPackBasis.ts, this being the read side that now reports
       * whatever it wrote correctly, from one shared Set, not two.
       */
      const measuredPackMeasureIds = new Set(
        metrics
          .map((m) => m.industry_measure_id)
          .filter((id): id is string => id !== null),
      );
      const gap = {
        unmapped_metrics: metrics.filter((m) => m.industry_measure_id === null),
        addressable_unmeasured: (pack ?? []).filter(
          (m) => m.addressable && !measuredPackMeasureIds.has(m.id),
        ),
      };

      const { rows: engagementRows } = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM engagements
          WHERE institution_id = $1 AND deleted_at IS NULL
          ORDER BY name`,
        [institutionId],
      );

      // Two simple queries rather than one with a window function — count
      // across every engagement at this institution, then the single most
      // recent run's own confidence, same join shape as runsIndex.ts.
      const { rows: [{ n: runCount }] } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM value_runs vr
           JOIN engagements e ON e.id = vr.engagement_id AND e.deleted_at IS NULL
          WHERE e.institution_id = $1 AND vr.deleted_at IS NULL`,
        [institutionId],
      );
      const { rows: [latestRun] } = await pool.query<{
        confidence_score: string;
        confidence_band: string;
      }>(
        `SELECT vr.confidence_score, vr.confidence_band
           FROM value_runs vr
           JOIN engagements e ON e.id = vr.engagement_id AND e.deleted_at IS NULL
          WHERE e.institution_id = $1 AND vr.deleted_at IS NULL
          ORDER BY vr.walked_at DESC
          LIMIT 1`,
        [institutionId],
      );

      res.json({
        institution: {
          id: institution.id,
          name: institution.name,
          industry: institution.industry,
          industry_id: institution.industry_id,
          industry_name: institution.industry_name,
          industry_slug: institution.industry_slug,
          is_tenant_self: institution.is_tenant_self,
        },
        pack,
        metrics,
        gap,
        engagements: engagementRows,
        runs: {
          count: runCount,
          latest_confidence_score: latestRun ? latestRun.confidence_score : null,
          latest_confidence_band: latestRun ? latestRun.confidence_band : null,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
