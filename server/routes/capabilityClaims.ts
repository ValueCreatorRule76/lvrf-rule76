import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 */

class ValidationError extends Error {}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} is required`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function requireUuidString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = requireString(obj, field, path);
  if (!isUuid(v)) {
    throw new ValidationError(`${path}.${field} must be a valid UUID`);
  }
  return v;
}

// POST /api/capabilities/:capabilityId/industry-measures — the missing edge
// in the solution-to-measure chain (db/drizzle/0023_*.sql): a capability
// claiming that it moves a specific industry measure, and by what
// mechanism. capability_industry_measures is NOT populated by any
// migration — a claim is a JUDGEMENT a person makes about what a
// capability actually changes, not a fact schema creation can assert. This
// endpoint is that act, and it is the only writer of that table.
//
// `claim` is required and is NOT CONTENT-VALIDATED — no length rule, no
// keyword check, nothing that inspects what the text actually says. No
// validation could tell "improves lot acceptance" (a restated outcome,
// not a mechanism) from "deviation handling and batch-record execution
// are the operator behaviours behind lot rejection" (an actual
// mechanism) — that distinction is a REVIEW concern, exercised by a
// person reading the claim, not something this endpoint can check by
// rule. What this endpoint enforces is only that a claim is PRESENT: a
// link with no stated mechanism is an assertion that two things are
// related, and an assertion with no author is the authored-prose problem
// this system exists to refuse.
export function capabilityClaimsRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:capabilityId/industry-measures', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const capabilityId = req.params.capabilityId;
    if (!isUuid(capabilityId)) {
      res.status(400).json({ message: `invalid capability id: ${capabilityId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record.
    let refusalTenantId: string | null = null;
    let refusalInstitutionId: string | null = null;

    try {
      const body = requireObject(req.body, 'body');
      const industryMeasureId = requireUuidString(body, 'industry_measure_id', 'body');
      const claim = requireString(body, 'claim', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      // institution_industry_name is only populated if the institution is
      // classified — needed to name a mismatch below without a second
      // round trip. Filtered to a live, current capability: soft-deleted
      // and superseded capabilities are both "missing" for this endpoint's
      // purposes, same as institutionClassify.ts's institution lookup.
      const { rows: [capability] } = await client.query<{
        id: string;
        name: string;
        institution_id: string;
        tenant_id: string;
        institution_name: string;
        institution_industry_id: string | null;
        institution_industry_name: string | null;
      }>(
        `SELECT c.id, c.name, c.institution_id, i.tenant_id, i.name AS institution_name,
                i.industry_id AS institution_industry_id, ind.name AS institution_industry_name
           FROM capabilities c
           JOIN institutions i ON i.id = c.institution_id AND i.deleted_at IS NULL
           LEFT JOIN industries ind ON ind.id = i.industry_id
          WHERE c.id = $1 AND c.deleted_at IS NULL AND c.superseded_by_id IS NULL`,
        [capabilityId],
      );
      if (!capability) {
        res.status(404).json({ message: `capability ${capabilityId} not found` });
        return;
      }
      refusalTenantId = capability.tenant_id;
      refusalInstitutionId = capability.institution_id;

      // Filtered to a live, current measure — soft-deleted and superseded
      // industry measures are both "missing" here, same reasoning as the
      // capability lookup above.
      const { rows: [measure] } = await client.query<{
        id: string;
        name: string;
        industry_id: string;
        industry_name: string;
      }>(
        `SELECT im.id, im.name, im.industry_id, ind.name AS industry_name
           FROM industry_measures im
           JOIN industries ind ON ind.id = im.industry_id
          WHERE im.id = $1 AND im.deleted_at IS NULL AND im.superseded_by_id IS NULL`,
        [industryMeasureId],
      );
      if (!measure) {
        res.status(404).json({ message: `industry measure ${industryMeasureId} not found` });
        return;
      }

      // THE PRECONDITION. A capability cannot claim to move a measure from
      // an industry pack its own account isn't classified into — that
      // claim would rest on a pack the account has no standing against.
      // Two distinct failures, named separately, because they have
      // different remedies: classify the institution, versus this measure
      // is simply the wrong pack for this account.
      if (capability.institution_industry_id === null) {
        res.status(422).json({
          message:
            `institution ${capability.institution_name} is not classified into any industry; ` +
            `classify it (POST /api/institutions/:institutionId/industry) before a capability ` +
            `of its can claim an industry measure`,
        });
        return;
      }
      if (capability.institution_industry_id !== measure.industry_id) {
        res.status(422).json({
          message:
            `institution ${capability.institution_name} is classified into ` +
            `${capability.institution_industry_name}, not ${measure.industry_name} — the industry ` +
            `that owns industry measure ${measure.name}`,
        });
        return;
      }

      // Named 409, not a bare constraint bounce: this is the common case
      // (a second claim on the same pair), and the caller needs to know
      // who claimed it and when, not just that it collides. The table's
      // UNIQUE(capability_id, industry_measure_id) constraint remains the
      // race guard for two concurrent requests landing between this
      // SELECT and the INSERT below — that race surfaces as a plain
      // unique_violation through handleGovernanceError instead, same as
      // every other race in this codebase.
      const { rows: [existingClaim] } = await client.query<{
        claim: string;
        claimed_at: Date;
        claimant_name: string;
      }>(
        `SELECT cim.claim, cim.claimed_at, p.full_name AS claimant_name
           FROM capability_industry_measures cim
           JOIN persons p ON p.id = cim.claimed_by_person_id
          WHERE cim.capability_id = $1 AND cim.industry_measure_id = $2`,
        [capabilityId, industryMeasureId],
      );
      if (existingClaim) {
        res.status(409).json({
          message:
            `capability ${capabilityId} already claims industry measure ${industryMeasureId}, ` +
            `by ${existingClaim.claimant_name} at ${existingClaim.claimed_at.toISOString()}; ` +
            `a claim is not amended — supersede the capability instead`,
        });
        return;
      }

      const { rows: [inserted] } = await client.query<{ id: string }>(
        `INSERT INTO capability_industry_measures (
           capability_id, industry_measure_id, claim, claimed_by_person_id
         ) VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [capabilityId, industryMeasureId, claim, actorPersonId],
      );

      res.status(201).json({
        capability_id: capabilityId,
        capability_name: capability.name,
        industry_measure_id: industryMeasureId,
        measure_name: measure.name,
        industry_name: measure.industry_name,
        claim_id: inserted.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // — or the unique-constraint race guard described above (ERRCODE
      // unique_violation, SQLSTATE 23505) — is the governance gate doing
      // its job, not a server fault. Its message goes to the caller
      // unchanged, not swallowed into a generic 500. handleGovernanceError
      // also records the attempt — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/capabilities/:capabilityId/industry-measures',
        subjectTable: 'capability_industry_measures',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: refusalInstitutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
