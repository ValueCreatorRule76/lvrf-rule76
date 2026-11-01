import { Router } from 'express';
import { recordAct } from '../lib/governanceAct.js';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { EvidenceFormError, parseEvidenceForm, type EvidenceFormFields } from '../lib/evidenceFormBody.js';
import { checkFigure, recordFigureCheck } from '../lib/figureCheck.js';

/**
 * Q4k (Q4k-D1, Brad, 12 Oct 2026), widened by L41 (LVRF_PLAN §13; Brad's D1–D8 and four conditions, 1 Nov
 * 2026): POST /api/evidence/:id/open-citation (authorized). The one act that verifies evidence, for every
 * row: a named person opened the source and says whether it supports what the evidence states. No route
 * takes source_verified from a body any more, and evidence_final refuses every other path.
 *
 * The separation that matters is between AI and a named human (AMENDMENT-005 Article III), so the person who
 * recorded the evidence may open it, as in account research. The act records WHO and WHEN
 * (citation_resolved_by_person_id, citation_resolved_at); it is final (evidence_resolution_is_final, hardening
 * section 9); ai_sourced stays true on the row for good: opening does not launder the origin.
 *
 * Yes: source_verified = true, in the same act. No: opened, and it stays (or, on a row verified before this
 * rule, becomes) unverified.
 *
 * WHAT WAS READ. A row from before evidence forms records none, so a Yes gives a quote or a locator with how
 * it was read, and the row takes that form, once. An attestation is verified only on the attester's own words
 * (Brad's condition 1): a quote or a locator from a document from that person, named as an email, a signed
 * statement or a letter; never the analyst's typing. A person's statement of an attestation takes that form
 * here. An observation citing no source has nothing to open, nor has simulated evidence. A row under a finding
 * has no source on record.
 *
 * WHAT A RUN SEES. produce-run seals each evidence row's citation_resolved, source_verified and derived basis
 * into its hashed payload at production time. Opening later changes the next run, never a sealed one.
 *
 * An AI-sourced account fact's evidence is opened in account research (D1: one research path).
 */

class ValidationError extends Error {}

const ATTESTER_DOCUMENTS = ['email', 'signed_statement', 'letter'];
const FIGURE_OF: Record<string, 'baseline_value' | 'actual_value' | 'claimed_currency_impact'> = {
  baseline: 'baseline_value', actual: 'actual_value', impact_basis: 'claimed_currency_impact',
};

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
        kind: string; evidence_form: string; source_reference: string | null; attested: boolean; under_finding: boolean; simulated: boolean;
      }>(
        `SELECT e.id, e.institution_id, i.tenant_id, e.ai_sourced, e.citation_resolved, rp.full_name AS resolved_by,
                e.citation_resolved_at AS resolved_at, e.deleted_at, e.superseded_by_id,
                e.kind::text, e.evidence_form::text, e.source_reference, e.attested_by_person_id IS NOT NULL AS attested, e.simulated,
                lvrf_evidence_under_finding(e.id) AS under_finding,
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
      if (await refuseUnknownFields(pool, req, res, ['source_verified', 'evidence_form', 'quote_text', 'locator', 'how_read', 'attester_document'],
        { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId })) return;
      if (typeof body.source_verified !== 'boolean') {
        throw new ValidationError('body.source_verified must say whether the opened source supports what the evidence states (true or false)');
      }
      if (e.ai_sourced && !e.on_outcome) {
        res.status(409).json({ message: "This evidence belongs to an account fact; its citation is opened in the account's research, not here." });
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
      if (e.evidence_form === 'statement' && e.kind === 'observation') {
        res.status(409).json({ message: "This is a person's statement citing no source; there is nothing to open." });
        return;
      }
      if (e.simulated) {
        res.status(409).json({ message: 'This evidence is simulated: there is no source to open.' });
        return;
      }
      if (e.under_finding) {
        res.status(409).json({ message: 'This figure has no source on record, so its evidence cannot be opened as verified.' });
        return;
      }
      const attestation = e.kind === 'attestation' || e.attested;
      const needsReading = e.evidence_form === 'legacy' || e.evidence_form === 'statement';
      let reading: EvidenceFormFields | null = null;
      let document: string | null = null;
      if (body.source_verified) {
        if (attestation) {
          if (typeof body.attester_document !== 'string' || !ATTESTER_DOCUMENTS.includes(body.attester_document)) {
            throw new EvidenceFormError("An attestation is verified on the attester's own words: name the document from that person (email, signed_statement or letter).");
          }
          document = body.attester_document;
        } else if (body.attester_document !== undefined) {
          throw new ValidationError('body.attester_document is for an attestation; this evidence is not one.');
        }
        if (needsReading) {
          reading = parseEvidenceForm(body, { allowStatement: false, kind: e.kind, sourceReference: e.source_reference });
        } else if (body.evidence_form !== undefined || body.quote_text !== undefined || body.locator !== undefined || body.how_read !== undefined) {
          throw new ValidationError('This evidence already records what it rests on, and that is final.');
        }
      } else if (['evidence_form', 'quote_text', 'locator', 'how_read', 'attester_document'].some((k) => body[k] !== undefined)) {
        throw new ValidationError('A source that does not support the evidence records no reading: leave the quote, locator and document empty.');
      }
      const { rows: [u] } = await client.query<{ source_verified: boolean; basis: string | null }>(
        `UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = $2, citation_resolved_at = now(),
                             source_verified = $3, attester_document = $4,
                             evidence_form = coalesce($5::evidence_form, evidence_form),
                             quote_text = coalesce($6, quote_text), locator = coalesce($7::jsonb, locator), how_read = coalesce($8, how_read)
          WHERE id = $1
          RETURNING source_verified, lvrf_evidence_basis(evidence.*) AS basis`,
        [id, actor, body.source_verified, document, reading?.evidenceForm ?? null, reading?.quoteText ?? null,
          reading?.locator ? JSON.stringify(reading.locator) : null, reading?.howRead ?? null],
      );
      // P1: a reading recorded here is checked against each figure its current links support, as at recording.
      if (reading) {
        const { rows: links } = await client.query<{ value_outcome_id: string; supports: string; baseline_value: string | null; actual_value: string | null; claimed_currency_impact: string | null }>(
          `SELECT l.value_outcome_id, l.supports, vo.baseline_value, vo.actual_value, vo.claimed_currency_impact
             FROM value_outcome_evidence l JOIN value_outcomes vo ON vo.id = l.value_outcome_id
            WHERE l.evidence_id = $1 AND l.withdrawn_at IS NULL`, [id]);
        for (const l of links) {
          const field = FIGURE_OF[l.supports];
          const figure = field ? l[field] : null;
          if (!field || figure === null) continue;
          await recordFigureCheck(client, {
            institutionId: e.institution_id, evidenceId: id, subjectTable: 'value_outcomes', subjectId: l.value_outcome_id,
            subjectField: field, valueChecked: figure, actorPersonId: actor,
          }, checkFigure({ numeric: Number(figure), text: null }, { form: reading.evidenceForm, quoteText: reading.quoteText, locator: reading.locator }));
        }
      }
      await recordAct(client, req, 'POST /api/evidence/:id/open-citation', { act: 'open_citation', tenantId: e.tenant_id, subjectTable: 'evidence', subjectId: id });
      res.status(200).json({ evidence_id: id, citation_resolved: true, ai_sourced: e.ai_sourced, source_verified: u.source_verified, basis: u.basis });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      if (err instanceof EvidenceFormError) {
        if (tenantId) await recordRouteRefusal(pool, req, { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId, attemptedPayload: req.body }, err.message);
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
