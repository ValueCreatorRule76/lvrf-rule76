import { Router, type Request } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * W1 fix (12 Oct 2026) — naming an EXISTING person (the tenant's own staff)
 * analyst of record on an account, with a title stated for that account,
 * through account_person_links (0037). No person row is created on the
 * account: for an outside-in walk, the honest analyst of record is the
 * vendor's analyst asserting from published material.
 *
 *   POST /api/institutions/:institutionId/analyst-of-record   (authorized)
 *   POST /api/account-person-links/:id/retire                  (authorized)
 *
 * A link never makes a person customer-side: it satisfies the capability-
 * owner and engagement-owner checks only (offeringAttachment.ts,
 * valueOutcomes.ts). Commit, verify and attestation still require a person
 * OF the institution, so an analyst of record can never verify an actual —
 * his own or anyone's — and value_outcomes_verifier_not_author holds besides.
 */

class ValidationError extends Error {
  constructor(public readonly issues: string[]) { super(issues.join('; ')); }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A current, non-simulated link of `personId` as analyst of record on `institutionId`. */
export async function isAnalystOfRecord(client: Pick<Pool, 'query'>, institutionId: string, personId: string): Promise<boolean> {
  const { rows: [l] } = await client.query(
    `SELECT 1 FROM account_person_links l JOIN persons p ON p.id = l.person_id
      WHERE l.institution_id = $1 AND l.person_id = $2 AND l.role = 'analyst_of_record' AND l.retired_at IS NULL
        AND NOT p.simulated AND p.deleted_at IS NULL`,
    [institutionId, personId],
  );
  return Boolean(l);
}

async function answer(pool: Pool, err: unknown, req: Request, res: import('express').Response, endpoint: string,
  subjectId: string | null, tenantId: string | null, institutionId: string | null) {
  if (err instanceof ValidationError) {
    res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, {
    endpoint, subjectTable: 'account_person_links', subjectId, tenantId, institutionId, attemptedPayload: req.body,
  })) return;
  respondServerError(res, err);
}

export function analystOfRecordRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:institutionId/analyst-of-record', async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/analyst-of-record';
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let tenantId: string | null = null;
    try {
      const actor = req.actor?.personId;
      if (!actor) throw new Error('req.actor missing on a request past requireActor');
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const { rows: [inst] } = await client.query<{ tenant_id: string; name: string }>(
        'SELECT tenant_id, name FROM institutions WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL', [institutionId],
      );
      if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = inst.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['person_id', 'title'],
        { endpoint, subjectTable: 'account_person_links', subjectId: null, tenantId, institutionId })) return;
      const b = req.body as Record<string, unknown>;
      const issues: string[] = [];
      const personId = typeof b.person_id === 'string' && isUuid(b.person_id) ? b.person_id : null;
      if (!personId) issues.push('body.person_id must be an id: the person to name');
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      if (title.length < 3) issues.push('body.title must state the title on this account, e.g. "External analyst of record — not an employee"');
      if (issues.length > 0) throw new ValidationError(issues);
      // The tenant's own current staff only; a customer's person, another
      // tenant's, a simulated one or an unknown id all read the same.
      const { rows: [p] } = await client.query<{ full_name: string }>(
        `SELECT full_name FROM persons WHERE id = $1 AND tenant_id = $2 AND NOT simulated AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [personId, tenantId],
      );
      if (!p) throw new ValidationError([`body.person_id ${personId} is not a current member of this tenant's staff (a customer's people belong to the account directly: add them as persons)`]);
      const { rows: [dup] } = await client.query(
        `SELECT 1 FROM account_person_links WHERE institution_id = $1 AND person_id = $2 AND role = 'analyst_of_record' AND retired_at IS NULL`,
        [institutionId, personId],
      );
      if (dup) {
        res.status(409).json({ message: `${p.full_name} is already the analyst of record on ${inst.name}; withdraw that link to change the title.` });
        return;
      }
      const { rows: [link] } = await client.query<{ id: string }>(
        `INSERT INTO account_person_links (tenant_id, institution_id, person_id, role, title, linked_by_person_id)
         VALUES ($1, $2, $3, 'analyst_of_record', $4, $5) RETURNING id`,
        [tenantId, institutionId, personId, title, actor],
      );
      res.status(201).json({ account_person_link_id: link.id, person_id: personId });
    } catch (err) {
      await answer(pool, err, req, res, endpoint, null, tenantId, institutionId);
    }
  });

  return router;
}

export function accountPersonLinkRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:id/retire', async (req, res) => {
    const endpoint = 'POST /api/account-person-links/:id/retire';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid account person link id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = req.actor?.personId;
      if (!actor) throw new Error('req.actor missing on a request past requireActor');
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const { rows: [l] } = await client.query<{ tenant_id: string; institution_id: string; retired_at: string | null }>(
        'SELECT tenant_id, institution_id, retired_at FROM account_person_links WHERE id = $1 FOR UPDATE', [id],
      );
      if (!l || isOtherTenant(req, l.tenant_id, { table: 'account_person_links', id })) {
        res.status(404).json({ message: `account person link ${id} not found` });
        return;
      }
      tenantId = l.tenant_id; institutionId = l.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['retirement_reason'],
        { endpoint, subjectTable: 'account_person_links', subjectId: id, tenantId, institutionId })) return;
      const reason = typeof req.body.retirement_reason === 'string' ? req.body.retirement_reason.trim() : '';
      if (reason.length < 12) throw new ValidationError(['body.retirement_reason must state why the link is withdrawn, in at least 12 characters']);
      if (l.retired_at !== null) {
        res.status(409).json({ message: `link ${id} is already withdrawn; a withdrawal is not amended.` });
        return;
      }
      await client.query(
        'UPDATE account_person_links SET retired_at = now(), retired_by_person_id = $2, retirement_reason = $3 WHERE id = $1',
        [id, actor, reason],
      );
      res.status(200).json({ account_person_link_id: id, retired: true });
    } catch (err) {
      await answer(pool, err, req, res, endpoint, id, tenantId, institutionId);
    }
  });

  return router;
}
