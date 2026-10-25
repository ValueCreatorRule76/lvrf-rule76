import { Router } from 'express';
import { recordAct } from '../lib/governanceAct.js';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary.
 *
 * POST /api/engagements/:id/retire — the first retirement writer in this
 * codebase. CLAUDE.md rule 2: "Retirement is deleted_at plus a status
 * change." Until now that sentence had no route behind it, so the only
 * way to retire anything was a hand-run UPDATE — an act with an actor
 * only if whoever ran it remembered to set one.
 *
 * WHAT IT DOES, in one transaction:
 *   1. Records the reason as an evidence row on the engagement's
 *      institution — kind 'observation', confidence 'low', source_verified
 *      false — the same shape classifyInstitution.ts uses for a person's
 *      stated judgement. A retirement with no stated reason is refused: a
 *      row disappearing from every view with nothing saying why is the
 *      authored-prose problem in reverse.
 *   2. Sets engagements.deleted_at = now() and status = 'retired', guarded
 *      on deleted_at IS NULL AND superseded_by_id IS NULL so a concurrent
 *      retirement or supersession is not silently overwritten. lvrf_audit
 *      records the UPDATE with the actor this request set.
 *
 * WHAT IT DOES NOT DO:
 *   - Touch value_runs. Locked runs are immutable, and an unlocked run is
 *     still a record that a walk happened. They stay, and runsIndex.ts
 *     already renders a run whose engagement is retired (LEFT JOIN, by
 *     design).
 *   - Cascade to value_outcomes, capabilities or evidence. Those are their
 *     own governed objects; retiring the engagement removes it from current
 *     views (every engagement read filters deleted_at), it does not erase
 *     what was claimed under it.
 *   - Un-retire. There is no reverse route: a mistaken retirement is
 *     corrected by a new engagement, with the retirement still on record.
 *
 * TENANT CHECK, done here even though other mutating routes lack it (see
 * BUILD_STATUS, Still outstanding): the actor's tenant must own the
 * engagement. Same COALESCE(person tenant, person's institution tenant)
 * resolution as institutionView.ts, and a cross-tenant id reads as 404,
 * identically to a missing one.
 */

class ValidationError extends Error {}

// Same floor as outcomeEvidence.ts / institutionFacts.ts provenance: a
// reason shorter than this is treated as no reason.
const MIN_REASON_LENGTH = 12;

export function engagementRetireRouter(pool: Pool): Router {
  const router = Router();

  // Brad-only (3.0 Q3): requireSteward before anything else runs.
  router.post('/:id/retire', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const engagementId = req.params.id;
    if (!isUuid(engagementId)) {
      res.status(400).json({ message: `invalid engagement id: ${engagementId}` });
      return;
    }

    let refusalTenantId: string | null = null;
    let refusalInstitutionId: string | null = null;
    let refusalSubjectTable = 'evidence';

    try {
      const body = req.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('body is required');
      }
      const reason = (body as Record<string, unknown>)['retirement_reason'];
      if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LENGTH) {
        throw new ValidationError(
          `body.retirement_reason must state why this engagement is being retired, in at least ${MIN_REASON_LENGTH} characters`,
        );
      }

      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        throw new Error('req.actor missing on a request past requireActor');
      }

      const { rows: [engagement] } = await client.query<{
        id: string;
        name: string;
        tenant_id: string;
        institution_id: string;
        institution_name: string;
        actor_name: string;
        run_count: number;
        locked_run_count: number;
      }>(
        `SELECT e.id, e.name, e.tenant_id, e.institution_id, i.name AS institution_name,
                actor.full_name AS actor_name,
                (SELECT count(*)::int FROM value_runs vr
                  WHERE vr.engagement_id = e.id AND vr.deleted_at IS NULL) AS run_count,
                (SELECT count(*)::int FROM value_runs vr
                  WHERE vr.engagement_id = e.id AND vr.deleted_at IS NULL
                    AND vr.locked_at IS NOT NULL) AS locked_run_count
           FROM engagements e
           JOIN institutions i ON i.id = e.institution_id
           JOIN persons actor ON actor.id = $2
          WHERE e.id = $1
            AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL`,
        [engagementId, actorPersonId],
      );
      // Sign-in P3: the tenant is checked after the lookup, by the shared
      // helper (it was a predicate in the WHERE), so a mismatch is logged.
      if (!engagement || isOtherTenant(req, engagement.tenant_id, { table: 'engagements', id: engagementId })) {
        res.status(404).json({
          message: `engagement ${engagementId} not found, already retired, or superseded`,
        });
        return;
      }
      refusalTenantId = engagement.tenant_id;
      refusalInstitutionId = engagement.institution_id;

      const { rows: [evidenceRow] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id,
           evidence_form
         ) VALUES ($1, 'observation', $2, $3, 'low', false, false, false, $4, 'statement')
         RETURNING id`,
        [
          engagement.institution_id,
          `Engagement retired: ${engagement.name}. Reason: ${reason}`,
          `Asserted at engagement retirement by ${engagement.actor_name}`,
          actorPersonId,
        ],
      );

      refusalSubjectTable = 'engagements';
      // Race guard: zero rows back means another request retired or
      // superseded it between the SELECT and here; the non-2xx rolls back
      // the evidence row above.
      const { rows: [retired] } = await client.query<{ deleted_at: string }>(
        `UPDATE engagements
            SET deleted_at = now(), status = 'retired'
          WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          RETURNING deleted_at`,
        [engagementId],
      );
      if (!retired) {
        res.status(409).json({
          message: `engagement ${engagementId} was retired or superseded by another request just now`,
        });
        return;
      }
      await recordAct(client, req, 'POST /api/engagements/:id/retire', {
        act: 'retire', tenantId: engagement.tenant_id, subjectTable: 'engagements', subjectId: engagementId,
        evidenceIds: [evidenceRow.id], reason: String(reason),
      });

      res.status(200).json({
        engagement_id: engagement.id,
        engagement_name: engagement.name,
        institution_name: engagement.institution_name,
        retired_at: retired.deleted_at,
        evidence_id: evidenceRow.id,
        // Stated so the caller knows what stayed: runs are untouched.
        runs_left_in_place: engagement.run_count,
        locked_runs_left_in_place: engagement.locked_run_count,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/engagements/:id/retire',
        subjectTable: refusalSubjectTable,
        subjectId: engagementId,
        tenantId: refusalTenantId,
        institutionId: refusalInstitutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  return router;
}
