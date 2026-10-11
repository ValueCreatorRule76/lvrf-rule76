import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary.
 *
 * POST /api/industries/:industryId/exclusions — the first writer of
 * industry_measure_exclusions. Records a person's judgement that a measure
 * does NOT belong in this industry's pack at all, so the same wrong
 * proposal is not made twice.
 *
 * NOT THE SAME FACT AS addressable = false. A pack entry marked not
 * addressable is KEPT in the pack, because "do not claim this, and here is
 * why" is something an account manager needs to read. An exclusion is a
 * measure that does not belong in the pack. A measure cannot be both: if
 * the name is a current pack entry in this industry, this refuses with 409
 * and says so — retire or supersede the entry first if the judgement has
 * changed.
 *
 * THE PERSON'S REASON IS REQUIRED; THE AGENT'S PROPOSAL IS KEPT APART.
 * Research runs list measures they "tested and excluded as unaddressable".
 * The parser deliberately does not write those (industryResearch.ts): an
 * agent proposing an exclusion is not a person deciding one. This route is
 * the person deciding. `reason` (at least 12 characters) is theirs. When a
 * research run proposed it, `proposed_by_research_tool` and
 * `proposal_text` carry the run's tool and its wording verbatim — both or
 * neither, enforced by industry_measure_exclusions_proposal_is_complete.
 * They are never merged into `reason`.
 *
 * Insert-only by schema (no deleted_at, no status): an exclusion is a
 * decision that happened. A second exclusion of the same name in the same
 * industry is refused by industry_measure_exclusions_industry_name_key
 * (409 via handleGovernanceError).
 *
 * Tenant-scoped like the parse route: an industry that does not exist and
 * one that belongs to another tenant both read as 404.
 */

class ValidationError extends Error {}

const MIN_REASON_LENGTH = 12;

function optionalNullableString(obj: Record<string, unknown>, field: string): string | null {
  const v = obj[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ValidationError(`body.${field} must be a string or null`);
  return v.trim() === '' ? null : v;
}

export function industryExclusionsRouter(pool: Pool): Router {
  const router = Router();

  // Brad-only (3.0 Q3): requireSteward before anything else runs.
  router.post('/:industryId/exclusions', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const industryId = req.params.industryId;
    if (!isUuid(industryId)) {
      res.status(400).json({ message: `invalid industry id: ${industryId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const body = req.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('body is required');
      }
      const b = body as Record<string, unknown>;
      const name = b['name'];
      if (typeof name !== 'string' || name.trim() === '') {
        throw new ValidationError('body.name is required');
      }
      const reason = b['reason'];
      if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LENGTH) {
        throw new ValidationError(
          `body.reason must state why this measure does not belong in the pack, in at least ${MIN_REASON_LENGTH} characters`,
        );
      }
      const citation = optionalNullableString(b, 'citation');
      const proposedByResearchTool = optionalNullableString(b, 'proposed_by_research_tool');
      const proposalText = optionalNullableString(b, 'proposal_text');
      if ((proposedByResearchTool === null) !== (proposalText === null)) {
        // The CHECK enforces this too; a 422 naming both fields is clearer.
        throw new ValidationError(
          'body.proposed_by_research_tool and body.proposal_text must be given together or not at all',
        );
      }

      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        throw new Error('req.actor missing on a request past requireActor');
      }

      // Sign-in P3: looked up by id, then tenant-checked by the shared
      // helper (it was a predicate in the WHERE), so a mismatch is logged.
      const { rows: [industry] } = await client.query<{ id: string; tenant_id: string; name: string }>(
        'SELECT id, tenant_id, name FROM industries WHERE id = $1',
        [industryId],
      );
      if (!industry || isOtherTenant(req, industry.tenant_id, { table: 'industries', id: industryId })) {
        res.status(404).json({ message: `industry ${industryId} not found` });
        return;
      }
      refusalTenantId = industry.tenant_id;

      // Exact name match against current pack entries — the same identity
      // the pack's own unique (industry_id, name) index uses.
      const { rows: [inPack] } = await client.query<{ id: string; addressable: boolean }>(
        `SELECT id, addressable FROM industry_measures
          WHERE industry_id = $1 AND name = $2
            AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [industryId, name],
      );
      if (inPack) {
        res.status(409).json({
          message:
            `"${name}" is a current entry in the ${industry.name} pack ` +
            `(${inPack.addressable ? 'claimable' : 'not addressable'}); a measure cannot be both in the pack ` +
            'and excluded from it. Retire or supersede the entry first if the judgement has changed.',
        });
        return;
      }

      const { rows: [exclusion] } = await client.query<{ id: string; excluded_at: string }>(
        `INSERT INTO industry_measure_exclusions (
           tenant_id, industry_id, name, reason, citation, excluded_by_person_id,
           proposed_by_research_tool, proposal_text
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, excluded_at`,
        [industry.tenant_id, industryId, name, reason, citation, actorPersonId, proposedByResearchTool, proposalText],
      );

      res.status(201).json({
        exclusion_id: exclusion.id,
        industry_name: industry.name,
        name,
        excluded_at: exclusion.excluded_at,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/industries/:industryId/exclusions',
        subjectTable: 'industry_measure_exclusions',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
