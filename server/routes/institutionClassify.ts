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

// POST /api/institutions/:institutionId/industry — classifies an account
// against the tenant's industries taxonomy. institutions.industry_id is
// NULL on every row on purpose (see schema.ts) — the migration that added
// it deliberately did not populate it, because classification is a
// JUDGEMENT a person makes about which taxonomy entry an account belongs
// to, not a fact a migration can assert. This endpoint is that act, and it
// is the only writer of industry_id: nothing else in this codebase sets it.
//
// institutions.industry (the free-text intake column) is NEVER touched
// here. That column holds WHAT WAS STATED at intake — Curia's reads
// "Contract research, development and manufacturing (CDMO)", and the
// taxonomy has no CDMO entry. Classifying it as Pharmaceutical &
// Biotechnology is a judgement that a CDMO belongs there; the statement and
// the classification are two different facts, and collapsing them would
// silently overwrite what the customer actually said with what a person
// later decided it meant.
//
// classification_note is required and NOT content-validated — it is not
// checked for length, keywords, or plausibility, any more than
// offeringAttachment's basis is. What it must be is present: a
// classification with no recorded reasoning is an assertion with no
// author, exactly the authored-prose problem this system exists to
// refuse. It is written as an evidence row (kind 'observation', confidence
// 'low', source_verified false), mirroring offeringAttachment's basis
// write exactly — same shape, same reasoning: this is a person's stated
// judgement, not a sourced fact, and the record says so honestly.
export function institutionClassifyRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:institutionId/industry', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record.
    let refusalTenantId: string | null = null;

    try {
      const body = requireObject(req.body, 'body');
      const industrySlug = requireString(body, 'industry_slug', 'body');
      const classificationNote = requireString(body, 'classification_note', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      // current_industry_name/slug are only populated if industry_id is
      // already set — needed to name the existing classification in the
      // 409 below, without a second round trip.
      const { rows: [institution] } = await client.query<{
        id: string;
        tenant_id: string;
        name: string;
        industry_id: string | null;
        current_industry_name: string | null;
        current_industry_slug: string | null;
      }>(
        `SELECT i.id, i.tenant_id, i.name, i.industry_id,
                ind.name AS current_industry_name, ind.slug AS current_industry_slug
           FROM institutions i
           LEFT JOIN industries ind ON ind.id = i.industry_id
          WHERE i.id = $1 AND i.deleted_at IS NULL`,
        [institutionId],
      );
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      refusalTenantId = institution.tenant_id;

      // A classification is not amended silently — the same reasoning as a
      // locked run (lockRun.ts): changing what an account IS changes what
      // every pack lookup already made against it meant. A second
      // classification supersedes the INSTITUTION, it does not overwrite
      // this one's industry_id.
      if (institution.industry_id !== null) {
        res.status(409).json({
          message:
            `institution ${institutionId} is already classified as ` +
            `${institution.current_industry_name} (${institution.current_industry_slug}); ` +
            `a classification is not amended — supersede the institution instead`,
        });
        return;
      }

      // Scoped by tenant_id first — this is the well-formed path, and if it
      // hits, the institution and industry already share a tenant by
      // construction. Only on a miss do we check whether the slug exists at
      // all (for any tenant), which is what tells apart the two distinct
      // failure modes the caller can hit: a slug that names nothing in this
      // taxonomy (404), versus a slug that names something, just not for
      // this institution's tenant (422 — a cross-tenant mismatch is a
      // caller error, not a missing-resource one).
      const { rows: [industry] } = await client.query<{ id: string; name: string; slug: string }>(
        'SELECT id, name, slug FROM industries WHERE tenant_id = $1 AND slug = $2',
        [institution.tenant_id, industrySlug],
      );
      if (!industry) {
        const { rows: [elsewhere] } = await client.query<{ tenant_id: string }>(
          'SELECT tenant_id FROM industries WHERE slug = $1 LIMIT 1',
          [industrySlug],
        );
        if (elsewhere) {
          res.status(422).json({
            message:
              `industry_slug '${industrySlug}' does not belong to tenant ${institution.tenant_id}; ` +
              `institution and industry must share a tenant`,
          });
          return;
        }
        res.status(404).json({ message: `industry_slug unknown for this tenant: ${industrySlug}` });
        return;
      }

      // actorContext already confirmed this id names a real, non-simulated
      // person before calling next() — this lookup is only for a readable
      // name in the provenance text, not another authorization check.
      const { rows: [actorPerson] } = await client.query<{ full_name: string }>(
        'SELECT full_name FROM persons WHERE id = $1',
        [actorPersonId],
      );

      const { rows: [evidenceRow] } = await client.query<{ id: string }>(
        `INSERT INTO evidence (
           institution_id, kind, summary, provenance, confidence,
           source_verified, ai_sourced, simulated, captured_by_person_id
         ) VALUES ($1, 'observation', $2, $3, 'low', false, false, false, $4)
         RETURNING id`,
        [
          institutionId,
          classificationNote,
          `Asserted at industry classification by ${actorPerson.full_name}`,
          actorPersonId,
        ],
      );

      // Race guard, same shape as outcomeWalk.ts's commit: if another
      // request classified this institution between the SELECT above and
      // this UPDATE, zero rows come back instead of silently overwriting
      // whoever won.
      const { rows: [updated] } = await client.query<{ industry_id: string }>(
        `UPDATE institutions
            SET industry_id = $1
          WHERE id = $2 AND industry_id IS NULL
          RETURNING industry_id`,
        [industry.id, institutionId],
      );
      if (!updated) {
        res.status(409).json({
          message: `institution ${institutionId} was classified by another request just now; retry to see the current classification`,
        });
        return;
      }

      res.status(201).json({
        institution_name: institution.name,
        industry_name: industry.name,
        industry_slug: industry.slug,
        evidence_id: evidenceRow.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault. Its
      // message names the amendment and the reason — that message IS the
      // product here, so it goes to the caller unchanged, not swallowed
      // into a generic 500. handleGovernanceError also records the attempt
      // — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/institutions/:institutionId/industry',
        subjectTable: 'institutions',
        subjectId: institutionId,
        tenantId: refusalTenantId,
        institutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
