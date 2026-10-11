import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';

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
 * TENANT-SCOPED BY THE ACTOR: isOtherTenant (lib/tenantScope.ts, sign-in
 * P3), which replaced the local resolveActorTenantId copies here, in
 * industryPack.ts and in cohort.ts — the third copy arrived.
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


export function institutionViewRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:id/view', async (req, res) => {
    const institutionId = req.params.id;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }

    try {
      // 404 covers "no such institution", "soft-deleted" and "belongs to
      // another tenant" identically: a caller on the wrong tenant gets the
      // same answer as a caller with a typo, not a hint that the id exists
      // elsewhere. Sign-in P3: the tenant is checked after the lookup, by
      // the shared helper, so a mismatch is logged (it was in the WHERE).
      const { rows: [institution] } = await pool.query<{
        id: string;
        name: string;
        industry: string | null;
        industry_id: string | null;
        website: string | null;
        is_tenant_self: boolean;
        industry_name: string | null;
        industry_slug: string | null;
        tenant_id: string;
      }>(
        `SELECT i.id, i.name, i.industry, i.industry_id, i.website, i.is_tenant_self, i.tenant_id,
                ind.name AS industry_name, ind.slug AS industry_slug
           FROM institutions i
           LEFT JOIN industries ind ON ind.id = i.industry_id
          WHERE i.id = $1 AND i.deleted_at IS NULL`,
        [institutionId],
      );
      if (!institution || isOtherTenant(req, institution.tenant_id, { table: 'institutions', id: institutionId })) {
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

      // Account workbench — current facts with their evidence's disclosure
      // state alongside. source_verified and citation_resolved come from the
      // evidence row, never from the fact: the fact has no verification of
      // its own (see db/schema.ts's institutionFacts comment), so the page
      // can render an unsourced figure as unverified exactly as the gate
      // says. value_numeric comes back as a string (pg numeric) and is
      // passed through as one — parsing it here would lose precision on a
      // large revenue figure.
      const { rows: facts } = await pool.query<{
        id: string;
        kind: string;
        value_numeric: string | null;
        value_text: string | null;
        unit: string | null;
        as_of: string;
        evidence_id: string;
        evidence_kind: string;
        provenance: string;
        source_reference: string | null;
        confidence: string;
        source_verified: boolean;
        ai_sourced: boolean;
        captured_by: string;
        created_at: string;
      }>(
        `SELECT f.id, f.kind, f.value_numeric, f.value_text, f.unit,
                to_char(f.as_of, 'YYYY-MM-DD') AS as_of,
                e.id AS evidence_id, e.kind AS evidence_kind, e.provenance,
                e.source_reference, e.confidence, e.source_verified, e.ai_sourced,
                p.full_name AS captured_by, f.created_at
           FROM institution_facts f
           JOIN evidence e ON e.id = f.evidence_id
           JOIN persons p ON p.id = f.captured_by_person_id
          WHERE f.institution_id = $1
            AND f.deleted_at IS NULL AND f.superseded_by_id IS NULL
          ORDER BY f.kind, f.as_of DESC, f.created_at DESC`,
        [institutionId],
      );

      // Fact supersession (0028): each current fact's earlier values, newest
      // first — walked back down the chain from the current row. Every
      // ancestor is returned with WHY it was replaced (its own
      // supersession_reason), and by whom and when (the successor that
      // replaced it: its captured_by and created_at, written in the same
      // transaction). The old rows are shown as history, never as current.
      const { rows: historyRows } = await pool.query<{
        current_id: string;
        id: string;
        value_numeric: string | null;
        value_text: string | null;
        unit: string | null;
        as_of: string;
        provenance: string;
        evidence_kind: string;
        source_verified: boolean;
        captured_by: string;
        created_at: string;
        superseded_at: string;
        superseded_by: string;
        supersession_reason: string;
        depth: number;
      }>(
        `WITH RECURSIVE chain AS (
           SELECT f.id AS current_id, f.id, 0 AS depth
             FROM institution_facts f
            WHERE f.institution_id = $1 AND f.deleted_at IS NULL AND f.superseded_by_id IS NULL
           UNION ALL
           SELECT c.current_id, prev.id, c.depth + 1
             FROM chain c
             JOIN institution_facts prev ON prev.superseded_by_id = c.id
         )
         SELECT c.current_id, f.id, f.value_numeric, f.value_text, f.unit,
                to_char(f.as_of, 'YYYY-MM-DD') AS as_of,
                e.provenance, e.kind AS evidence_kind, e.source_verified,
                p.full_name AS captured_by, f.created_at,
                succ.created_at AS superseded_at, sp.full_name AS superseded_by,
                f.supersession_reason, c.depth
           FROM chain c
           JOIN institution_facts f ON f.id = c.id
           JOIN evidence e ON e.id = f.evidence_id
           JOIN persons p ON p.id = f.captured_by_person_id
           JOIN institution_facts succ ON succ.id = f.superseded_by_id
           JOIN persons sp ON sp.id = succ.captured_by_person_id
          WHERE c.depth > 0
          ORDER BY c.current_id, c.depth`,
        [institutionId],
      );
      const historyOf = new Map<string, Omit<(typeof historyRows)[number], 'current_id' | 'depth'>[]>();
      for (const { current_id, depth: _depth, ...h } of historyRows) {
        const list = historyOf.get(current_id) ?? [];
        list.push(h);
        historyOf.set(current_id, list);
      }

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
          website: institution.website,
          is_tenant_self: institution.is_tenant_self,
        },
        facts: facts.map((f) => ({ ...f, history: historyOf.get(f.id) ?? [] })),
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
