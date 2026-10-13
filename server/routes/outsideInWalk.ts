import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * Q4c2 — GET /api/institutions/:institutionId/walk: everything the account
 * page's outside-in walk card needs to show which step is done, which is
 * next, and what each waits for (LVRF_PLAN §4c). A READ; it writes nothing.
 * Every step the card offers is an existing write route, under the session
 * — no new actor path.
 *
 * A separate read, not more fields on /view: /view is the account
 * manager's read and stays byte-identical (as Q4c1 kept the pack GET).
 *
 * Tenant-checked like /view: another tenant's account reads as not found,
 * and the mismatch is logged.
 */
export function outsideInWalkRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:institutionId/walk', async (req, res) => {
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    try {
      const { rows: [inst] } = await pool.query<{
        id: string; tenant_id: string; name: string; industry_id: string | null; industry_slug: string | null; industry_name: string | null;
      }>(
        `SELECT i.id, i.tenant_id, i.name, i.industry_id, ind.slug AS industry_slug, ind.name AS industry_name
           FROM institutions i LEFT JOIN industries ind ON ind.id = i.industry_id
          WHERE i.id = $1 AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL`,
        [institutionId],
      );
      if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }

      // The account's own people (customer-side): the analyst of record is one.
      const { rows: persons } = await pool.query(
        `SELECT id, full_name, email, title FROM persons
          WHERE institution_id = $1 AND NOT simulated AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY created_at, id`,
        [institutionId],
      );
      // The tenant's offering catalog, current entries.
      const { rows: offerings } = await pool.query(
        `SELECT offering_key, name, family FROM offerings
          WHERE tenant_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY name, offering_key`,
        [inst.tenant_id],
      );
      // The pack of the account's industry, with what the claim step shows:
      // definition, unit and CONFOUNDERS.
      const { rows: pack } = inst.industry_id
        ? await pool.query(
          `SELECT id, name, unit, direction, definition, confounders, addressable FROM industry_measures
            WHERE industry_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
            ORDER BY addressable DESC, name`,
          [inst.industry_id],
        )
        : { rows: [] };
      const { rows: capabilities } = await pool.query(
        `SELECT c.id, c.name, c.created_at,
                coalesce(json_agg(json_build_object(
                  'industry_measure_id', cim.industry_measure_id, 'measure_name', m.name,
                  'claim', cim.claim, 'claimed_at', cim.claimed_at, 'claimed_by', p.full_name)
                  ORDER BY cim.claimed_at) FILTER (WHERE cim.id IS NOT NULL), '[]') AS claims
           FROM capabilities c
           LEFT JOIN capability_industry_measures cim ON cim.capability_id = c.id
           LEFT JOIN industry_measures m ON m.id = cim.industry_measure_id
           LEFT JOIN persons p ON p.id = cim.claimed_by_person_id
          WHERE c.institution_id = $1 AND c.deleted_at IS NULL AND c.superseded_by_id IS NULL
          GROUP BY c.id ORDER BY c.created_at, c.id`,
        [institutionId],
      );
      const { rows: engagements } = await pool.query(
        `SELECT e.id, e.name, e.status, (e.deleted_at IS NOT NULL) AS retired,
                coalesce((SELECT json_agg(json_build_object(
                    -- Dates as UTC calendar dates: json_build_object would render the
                    -- timestamptz in the session time zone, and a 30 Sep midnight UTC
                    -- baseline would read as 29 Sep.
                    'id', vo.id, 'baseline_value', vo.baseline_value,
                    'baseline_measured_at', to_char(vo.baseline_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
                    'target_value', vo.target_value, 'realization', vo.realization, 'confidence', vo.confidence,
                    'capability_name', c.name,
                    'metric', json_build_object('id', bm.id, 'name', bm.name, 'unit', bm.unit, 'direction', bm.direction,
                                                'source_system', bm.source_system, 'industry_measure_id', bm.industry_measure_id),
                    'evidence', coalesce((SELECT json_agg(json_build_object('id', ev.id, 'kind', ev.kind, 'supports', voe.supports,
                                                                            'summary', ev.summary, 'basis', lvrf_evidence_basis(ev),
                                                                            -- Q4k: the citation state, for "Open the citation…"
                                                                            'ai_sourced', ev.ai_sourced, 'source_verified', ev.source_verified,
                                                                            'citation_resolved', ev.citation_resolved,
                                                                            'citation_resolved_by', (SELECT full_name FROM persons WHERE id = ev.citation_resolved_by_person_id),
                                                                            'citation_resolved_at', to_char(ev.citation_resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')) ORDER BY ev.created_at)
                                            FROM value_outcome_evidence voe JOIN evidence ev ON ev.id = voe.evidence_id
                                           WHERE voe.value_outcome_id = vo.id), '[]'))
                    ORDER BY vo.created_at)
                   FROM value_outcomes vo
                   JOIN business_metrics bm ON bm.id = vo.business_metric_id
                   LEFT JOIN capabilities c ON c.id = vo.capability_id
                  WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL), '[]') AS outcomes,
                coalesce((SELECT json_agg(json_build_object('id', r.id, 'run_number', r.run_number,
                                                            'locked_at', to_char(r.locked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"'),
                                                            'confidence_band', r.confidence_band) ORDER BY r.run_number)
                            FROM value_runs r WHERE r.engagement_id = e.id AND r.deleted_at IS NULL), '[]') AS runs
           FROM engagements e
          WHERE e.institution_id = $1 AND e.superseded_by_id IS NULL
          ORDER BY e.created_at, e.id`,
        [institutionId],
      );
      // W1 fix: the account's analysts of record (existing staff, linked with
      // a per-account title), and the tenant's current staff to choose from.
      const { rows: analysts } = await pool.query(
        `SELECT l.id AS link_id, p.id, p.full_name, p.email, l.title, lb.full_name AS linked_by, l.linked_at
           FROM account_person_links l JOIN persons p ON p.id = l.person_id JOIN persons lb ON lb.id = l.linked_by_person_id
          WHERE l.institution_id = $1 AND l.role = 'analyst_of_record' AND l.retired_at IS NULL
          ORDER BY l.linked_at, l.id`,
        [institutionId],
      );
      const { rows: staff } = await pool.query(
        `SELECT id, full_name, email FROM persons
          WHERE tenant_id = $1 AND NOT simulated AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY full_name, id`,
        [inst.tenant_id],
      );
      res.json({
        institution: { id: inst.id, name: inst.name, industry_slug: inst.industry_slug, industry_name: inst.industry_name },
        persons, analysts, staff, offerings, pack, capabilities, engagements,
      });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  return router;
}
