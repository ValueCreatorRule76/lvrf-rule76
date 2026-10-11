import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { classifyInstitution } from '../lib/classifyInstitution.js';

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

      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('req.actor missing on a request past requireActor');
      }

      // The act itself lives in server/lib/classifyInstitution.ts, shared
      // with POST /api/account-inputs so the create form can classify in
      // the same transaction. Behaviour here is unchanged.
      const result = await classifyInstitution(client, req, {
        institutionId,
        industrySlug,
        classificationNote,
        actorPersonId,
        onTenantResolved: (t) => { refusalTenantId = t; },
      });
      if (!result.ok) {
        res.status(result.status).json({ message: result.message });
        return;
      }

      res.status(201).json({
        institution_name: result.institutionName,
        industry_name: result.industryName,
        industry_slug: result.industrySlug,
        evidence_id: result.evidenceId,
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
