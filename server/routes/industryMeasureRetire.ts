import { Router } from 'express';
import { recordAct } from '../lib/governanceAct.js';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * Q4c1b — POST /api/industry-measures/:id/retire. Retires one pack entry:
 * a steward's act (3.0 Band A), with a reason, recorded on the row itself
 * (0032: retired_by_person_id, retirement_reason, set together with
 * deleted_at and status 'retired' — industry_measures_retirement_is_complete).
 *
 * WHY IT EXISTS. Accepting a research result is final (a decision is not
 * amended), and until this route nothing could take an accepted entry back
 * out of a pack: the exclusions route already said "Retire or supersede the
 * entry first" to a route that did not exist. Q4e made it concrete — six
 * accepted IT entries Brad judged should not stand.
 *
 * WHAT IT DOES NOT TOUCH. The accepted research_result stays accepted and
 * keeps pointing at this entry: it records that a person accepted it then;
 * this records that a person retired it now. Nothing is hidden — the pack
 * GET returns retired entries in their own list (industryPack.ts).
 *
 * WHAT IT REFUSES (409, naming each one) — while anything CURRENT depends
 * on the entry: a claim (capability_industry_measures) by a capability that
 * is neither retired nor superseded, or a pack basis
 * (business_metrics.industry_measure_id) on a metric that is neither.
 * Retiring under them would leave an account claiming against a measure
 * the pack no longer stands behind. Supersede those first.
 *
 * AFTER IT: the name is free — the exclusions route's "in the pack" test
 * counts current entries only, so the name can be excluded; and, if it is
 * not excluded, a later accepted result can bring it back as a new row (the
 * unique name index is partial over current entries).
 *
 * Outside the research-intake seam (CLAUDE.md, D1): this is a pack act on
 * industry_measures, like industryExclusions.ts, not research intake.
 */

class ValidationError extends Error {}

// Same floor as engagementRetire.ts and the CHECK in 0032.
const MIN_REASON_LENGTH = 12;

export function industryMeasureRetireRouter(pool: Pool): Router {
  const router = Router();

  // Brad-only (3.0 Band A): requireSteward before anything else runs.
  router.post('/:id/retire', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const measureId = req.params.id;
    if (!isUuid(measureId)) {
      res.status(400).json({ message: `invalid industry measure id: ${measureId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const body = req.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('body is required');
      }
      const reason = (body as Record<string, unknown>)['retirement_reason'];
      if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LENGTH) {
        throw new ValidationError(
          `body.retirement_reason must state why this entry is being retired, in at least ${MIN_REASON_LENGTH} characters`,
        );
      }

      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        throw new Error('req.actor missing on a request past requireActor');
      }

      // FOR UPDATE: two retirements of the same entry serialize here; the
      // second sees the first's deleted_at and is refused below.
      const { rows: [entry] } = await client.query<{
        id: string; name: string; tenant_id: string; industry_name: string; status: string;
        deleted_at: string | null; superseded_by_id: string | null;
        retired_by: string | null; retirement_reason: string | null;
      }>(
        `SELECT m.id, m.name, m.tenant_id, i.name AS industry_name, m.status, m.deleted_at,
                m.superseded_by_id, rb.full_name AS retired_by, m.retirement_reason
           FROM industry_measures m
           JOIN industries i ON i.id = m.industry_id
           LEFT JOIN persons rb ON rb.id = m.retired_by_person_id
          WHERE m.id = $1
          FOR UPDATE OF m`,
        [measureId],
      );
      // Sign-in P3: missing and another tenant's read the same, and the
      // mismatch is logged.
      if (!entry || isOtherTenant(req, entry.tenant_id, { table: 'industry_measures', id: measureId })) {
        res.status(404).json({ message: `industry measure ${measureId} not found` });
        return;
      }
      refusalTenantId = entry.tenant_id;

      if (entry.deleted_at !== null) {
        const by = entry.retired_by ? ` by ${entry.retired_by}` : '';
        const why = entry.retirement_reason ? `: "${entry.retirement_reason}"` : '';
        res.status(409).json({
          message: `"${entry.name}" was already retired${by} on ${new Date(entry.deleted_at).toISOString().slice(0, 10)}${why}. A retirement is not repeated or amended.`,
        });
        return;
      }
      if (entry.superseded_by_id !== null) {
        res.status(409).json({
          message: `"${entry.name}" was superseded by ${entry.superseded_by_id}; retire the current version instead.`,
        });
        return;
      }

      const { rows: claims } = await client.query<{ capability_name: string; institution_name: string }>(
        `SELECT c.name AS capability_name, i.name AS institution_name
           FROM capability_industry_measures cim
           JOIN capabilities c ON c.id = cim.capability_id
           JOIN institutions i ON i.id = c.institution_id
          WHERE cim.industry_measure_id = $1
            AND c.deleted_at IS NULL AND c.superseded_by_id IS NULL
          ORDER BY i.name, c.name`,
        [measureId],
      );
      const { rows: bases } = await client.query<{ metric_name: string; institution_name: string }>(
        `SELECT b.name AS metric_name, i.name AS institution_name
           FROM business_metrics b
           JOIN institutions i ON i.id = b.institution_id
          WHERE b.industry_measure_id = $1
            AND b.deleted_at IS NULL AND b.superseded_by_id IS NULL
          ORDER BY i.name, b.name`,
        [measureId],
      );
      if (claims.length > 0 || bases.length > 0) {
        const named = [
          ...claims.map((c) => `the capability "${c.capability_name}" at ${c.institution_name} claims it`),
          ...bases.map((b) => `the metric "${b.metric_name}" at ${b.institution_name} uses it as its pack basis`),
        ];
        res.status(409).json({
          message:
            `"${entry.name}" cannot be retired while current work depends on it: ${named.join('; ')}. ` +
            'Supersede those first; an account must not claim against an entry the pack no longer stands behind.',
          dependents: named,
        });
        return;
      }

      // The four marks together, or the CHECK (0032) refuses the write.
      const { rows: [retired] } = await client.query<{ deleted_at: string }>(
        `UPDATE industry_measures
            SET deleted_at = now(), status = 'retired',
                retired_by_person_id = $2, retirement_reason = $3
          WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          RETURNING deleted_at`,
        [measureId, actorPersonId, reason],
      );
      if (!retired) {
        res.status(409).json({ message: `"${entry.name}" was retired or superseded by another request just now` });
        return;
      }
      await recordAct(client, req, 'POST /api/industry-measures/:id/retire', {
        act: 'withdraw', tenantId: entry.tenant_id, subjectTable: 'industry_measures', subjectId: measureId, reason: String(reason),
      });

      res.status(200).json({
        industry_measure_id: entry.id,
        name: entry.name,
        industry_name: entry.industry_name,
        retired_at: retired.deleted_at,
        // Stated so the caller knows what stayed: the accepted research
        // result is untouched, and the name is now free.
        research_result_left_accepted: true,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/industry-measures/:id/retire',
        subjectTable: 'industry_measures',
        subjectId: measureId,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: req.body,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  return router;
}
