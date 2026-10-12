import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { actorTenantId } from './tenantScope.js';

/**
 * 3.0 Band A item 2 — the acts that are Brad's alone, through ONE check.
 *
 * Decided by Brad Piver, 11 October 2026 (3.0 draft Q3, plan D3/D4/D6):
 * the steward — tenants.steward_person_id — alone may grant or revoke
 * access, accept, reject or exclude pack entries, ratify or demote, retire
 * an engagement, issue a model version, and change a stated threshold.
 * Authorized users research, record facts and evidence, walk outcomes, and
 * produce and lock runs.
 *
 * Of those acts, four are API routes today; they carry requireSteward in
 * their router call. The rest are not routes, and that is stated here so
 * nobody assumes otherwise:
 *   - grant / revoke access: scripts/grant_access.ts, revoke_access.ts
 *     (the steward's own password; access_grants_steward_only in the DB);
 *   - ratify / demote: NO ROUTE YET. Any route that does it must be
 *     classified 'steward' from its first commit — the coverage guard
 *     (verify_steward_acts.sh) fails an unclassified route;
 *   - model version and thresholds: changed by commit and deploy; the
 *     commit author is the decider (D6).
 *
 * STEWARD_ROUTES below is the single list. verify_steward_acts.sh compares
 * it with the source (scripts/list_api_routes.mjs --classify): every
 * mutating route must be listed, and a route marked 'steward' must carry
 * requireSteward(pool) in its router call while an 'authorized' one must
 * not. So the wider reach cannot ship by accident, as with P3's tenant
 * check.
 */
export const MUTATING_ROUTE_CLASS: Record<string, 'steward' | 'authorized'> = {
  // Brad-only (Q3 + D3)
  'POST /api/research-results/:id/accept': 'steward',
  'POST /api/research-results/:id/reject': 'steward',
  'POST /api/industries/:industryId/exclusions': 'steward',
  'POST /api/industry-measures/:id/retire': 'steward',
  'POST /api/industry-measures/:id/levers': 'steward',
  'POST /api/value-levers/:id/offerings': 'steward',
  'POST /api/value-levers/:id/retire': 'steward',
  'POST /api/lever-offerings/:id/retire': 'steward',
  'POST /api/engagements/:id/retire': 'steward',
  // Authorized users (Q3 + D3: classify, offerings, validate, pack-basis and
  // claims are authorized-user acts)
  'POST /api/account-inputs': 'authorized',
  'POST /api/account-research-results/:id/accept': 'authorized',
  'POST /api/account-research-results/:id/reject': 'authorized',
  'POST /api/business-metrics/:metricId/pack-basis': 'authorized',
  'POST /api/business-metrics/:metricId/validate': 'authorized',
  'POST /api/capabilities/:capabilityId/industry-measures': 'authorized',
  'POST /api/engagements/:engagementId/produce-run': 'authorized',
  'POST /api/industries/:industryId/research-prompts': 'authorized',
  'POST /api/industries/:industryId/research-results': 'authorized',
  'POST /api/institutions/:institutionId/entity/supersede': 'authorized',
  'POST /api/institutions/:institutionId/facts': 'authorized',
  'POST /api/institutions/:institutionId/facts/:factId/supersede': 'authorized',
  'POST /api/institutions/:institutionId/industry': 'authorized',
  'POST /api/institutions/:institutionId/inputs': 'authorized',
  'POST /api/institutions/:institutionId/offerings': 'authorized',
  'POST /api/institutions/:institutionId/research-prompts': 'authorized',
  'POST /api/institutions/:institutionId/research-results': 'authorized',
  'POST /api/institutions/:institutionId/value-outcomes': 'authorized',
  'POST /api/value-outcomes/:outcomeId/commit': 'authorized',
  'POST /api/value-outcomes/:outcomeId/evidence': 'authorized',
  'POST /api/value-outcomes/:outcomeId/measure': 'authorized',
  'POST /api/value-outcomes/:outcomeId/verify': 'authorized',
  'POST /api/value-runs/:runId/lock': 'authorized',
  'POST /api/value-runs/:runId/record-document': 'authorized',
};

/** What each steward-only route does, for the 403's sentence. */
const ACT_NAME: Record<string, string> = {
  'POST /api/research-results/:id/accept': 'Accepting a pack entry',
  'POST /api/research-results/:id/reject': 'Rejecting a research result',
  'POST /api/industries/:industryId/exclusions': 'Excluding a measure from a pack',
  'POST /api/engagements/:id/retire': 'Retiring an engagement',
  'POST /api/industry-measures/:id/retire': 'Retiring a pack entry',
  'POST /api/industry-measures/:id/levers': 'Proposing a value lever',
  'POST /api/value-levers/:id/offerings': 'Linking a solution to a lever',
  'POST /api/value-levers/:id/retire': 'Withdrawing a value lever',
  'POST /api/lever-offerings/:id/retire': 'Withdrawing a solution from a lever',
};

/** The actor's tenant's steward: { id, full_name }, or null if none is named. */
export async function stewardOfActor<P>(
  pool: Pool,
  req: Request<P>,
): Promise<{ id: string; full_name: string } | null> {
  const { rows: [s] } = await pool.query<{ id: string; full_name: string }>(
    `SELECT p.id, p.full_name FROM tenants t JOIN persons p ON p.id = t.steward_person_id WHERE t.id = $1`,
    [actorTenantId(req as unknown as Request)],
  );
  return s ?? null;
}

/**
 * Per-route middleware for the steward's acts. Same tenant as the actor
 * (P3 already guarantees that), so a refusal here is a 403 that names the
 * act and the steward — not the 404 of a tenant mismatch. Not recorded in
 * refusals (that table feeds the gap register); logged at info.
 */
export function requireSteward(pool: Pool) {
  // Generic over the route's params, so Express still infers ":id" etc. for
  // the handler after it (a plain Request here would widen them).
  return function requireStewardMiddleware<P>(req: Request<P>, res: Response, next: NextFunction): void {
    stewardOfActor(pool, req)
      .then((steward) => {
        if (steward && req.actor && steward.id === req.actor.personId) {
          next();
          return;
        }
        const path = req.route?.path === '/' ? '' : (req.route?.path ?? '');
        const route = `${req.method} ${req.baseUrl}${path}`;
        const act = ACT_NAME[route] ?? 'This';
        console.info(`LVRF steward-only act refused: actor ${req.actor?.personId} ${route}`);
        res.status(403).json({
          code: 'steward_only',
          message: steward
            ? `${act} is the steward's act (${steward.full_name}).`
            : `${act} is the steward's act, and this tenant has no steward named.`,
        });
      })
      .catch(next);
  };
}
