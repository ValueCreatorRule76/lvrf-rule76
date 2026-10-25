import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * Q4k (Q4k-D1, Brad, 12 Oct 2026) — "Open the citation…" for OUTCOME
 * evidence: POST /api/evidence/:id/open-citation (authorized).
 *
 * The separation that matters is between AI and a named human (AMENDMENT-005
 * Article III), so the person who recorded the evidence may open its
 * citation — as in account research, where one person runs the research and
 * opens the citations. The act records WHO opened it and WHEN
 * (citation_resolved_by_person_id, citation_resolved_at); it is final
 * (evidence_resolution_is_final, hardening section 9); and ai_sourced stays
 * true on the row for good: opening does not launder the origin.
 *
 * The person also says whether the source supports what the evidence
 * states. Yes: source_verified = true, in the same act — the CHECK
 * evidence_ai_verify_requires_resolution admits it because the citation is
 * now opened. No: the citation is recorded as opened and the evidence stays
 * unverified.
 *
 * WHAT A RUN SEES. produce-run seals each evidence row's citation_resolved,
 * source_verified and derived basis into its hashed payload at production
 * time. Opening a citation later changes the next run, never a sealed one
 * (and a locked run is immutable besides).
 *
 * Only evidence attached to a value outcome: an account fact's evidence is
 * opened in account research (D1: one research path).
 */

class ValidationError extends Error {}

export function evidenceCitationRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:id/open-citation', async (req, res) => {
    const endpoint = 'POST /api/evidence/:id/open-citation';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid evidence id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = req.actor?.personId;
      if (!actor) throw new Error('req.actor missing on a request past requireActor');
      const body = req.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ValidationError('body is required');
      const { rows: [e] } = await client.query<{
        id: string; institution_id: string; tenant_id: string; ai_sourced: boolean; citation_resolved: boolean;
        resolved_by: string | null; resolved_at: string | null; deleted_at: string | null; superseded_by_id: string | null; on_outcome: boolean;
      }>(
        `SELECT e.id, e.institution_id, i.tenant_id, e.ai_sourced, e.citation_resolved, rp.full_name AS resolved_by,
                e.citation_resolved_at AS resolved_at, e.deleted_at, e.superseded_by_id,
                EXISTS (SELECT 1 FROM value_outcome_evidence voe WHERE voe.evidence_id = e.id AND voe.withdrawn_at IS NULL) AS on_outcome
           FROM evidence e JOIN institutions i ON i.id = e.institution_id
           LEFT JOIN persons rp ON rp.id = e.citation_resolved_by_person_id
          WHERE e.id = $1 FOR UPDATE OF e`,
        [id],
      );
      if (!e || isOtherTenant(req, e.tenant_id, { table: 'evidence', id })) {
        res.status(404).json({ message: `evidence ${id} not found` });
        return;
      }
      tenantId = e.tenant_id; institutionId = e.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['source_verified'],
        { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId })) return;
      if (typeof body.source_verified !== 'boolean') {
        throw new ValidationError('body.source_verified must say whether the opened source supports what the evidence states (true or false)');
      }
      if (!e.on_outcome) {
        res.status(409).json({ message: "This evidence belongs to an account fact; its citation is opened in the account's research, not here." });
        return;
      }
      if (!e.ai_sourced) {
        res.status(409).json({ message: 'Only AI-sourced evidence has a citation to open; this was recorded by a person from its source.' });
        return;
      }
      if (e.deleted_at !== null || e.superseded_by_id !== null) {
        res.status(409).json({ message: 'This evidence is not current (retired or superseded).' });
        return;
      }
      if (e.citation_resolved) {
        res.status(409).json({ message: `This citation was already opened by ${e.resolved_by ?? 'an unrecorded person'} on ${e.resolved_at ? new Date(e.resolved_at).toISOString().slice(0, 10) : 'an unrecorded date'}; an opened citation is final.` });
        return;
      }
      const { rows: [u] } = await client.query<{ source_verified: boolean; basis: string | null }>(
        `UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = $2, citation_resolved_at = now(),
                             source_verified = $3
          WHERE id = $1
          RETURNING source_verified, lvrf_evidence_basis(evidence.*) AS basis`,
        [id, actor, body.source_verified],
      );
      res.status(200).json({ evidence_id: id, citation_resolved: true, ai_sourced: true, source_verified: u.source_verified, basis: u.basis });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  return router;
}
