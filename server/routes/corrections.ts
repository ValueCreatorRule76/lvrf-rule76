import { Router, type Request, type Response } from 'express';
import { recordAct } from '../lib/governanceAct.js';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { checkFigure, recordFigureCheck, type Locator } from '../lib/figureCheck.js';
import { recomputeWithCorrection } from '../lib/recomputeRun.js';
import { ACT_SUPPORTS, SUPPORTS_WORD, isSupports, type Supports } from '../lib/supports.js';

/**
 * C1 (LVRF_PLAN §9; Brad's ruling and C1-D1–D4, 25 Oct 2026) — the two
 * correction acts, the steward's alone:
 *
 *   POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support
 *     what a link supports was recorded wrong: WITHDRAW the current link (who,
 *     when, why), THEN record the corrected one, which names what it replaces —
 *     in one transaction, in that order (an insert first is refused by
 *     value_outcome_evidence_one_current). Allowed on a retired engagement's
 *     frozen outcome: the only write there that is (C1-D2).
 *
 *   POST /api/value-runs/:runId/errata
 *     a sealed run got it wrong: an erratum beside it — what was wrong, what is
 *     right, why — with the server's recompute of the run's confidence under the
 *     model it was sealed with (C1-D3). A score is never typed: a body naming
 *     one is refused. The sealed run is never touched. One erratum per run and
 *     correction: a later one supersedes the current one, naming it
 *     (supersedes_erratum_id) with a reason (C1 review, Brad, 25 Oct 2026).
 *
 * All writes on req.dbClient, inside actorContext's transaction.
 */

class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MIN_REASON = 12;

async function answer(pool: Pool, err: unknown, req: Request, res: Response,
  ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string | null; institutionId: string | null; valueOutcomeId?: string | null }) {
  if (err instanceof Refusal) {
    if (ctx.tenantId) {
      await recordRouteRefusal(pool, req, { ...ctx, tenantId: ctx.tenantId, attemptedPayload: req.body }, err.message);
    }
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, { ...ctx, attemptedPayload: req.body })) return;
  respondServerError(res, err);
}

const actorOf = (req: Request): string => {
  const a = req.actor?.personId;
  if (!a) throw new Error('req.actor missing on a request past requireActor');
  return a;
};

export function correctionsOutcomeRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:outcomeId/evidence/:evidenceId/correct-support', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support';
    const client: PoolClient = req.dbClient!;
    const { outcomeId, evidenceId } = req.params;
    if (!isUuid(outcomeId) || !isUuid(evidenceId)) {
      res.status(400).json({ message: 'invalid value outcome or evidence id' });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new Refusal(422, 'Say what the evidence supports, and why the link is corrected.');
      const { rows: [link] } = await client.query<{
        supports: string; tenant_id: string; institution_id: string; baseline_value: string | null; actual_value: string | null;
        claimed_currency_impact: string | null; evidence_form: string; quote_text: string | null; locator: Locator | null; kind: string;
      }>(
        `SELECT voe.supports, i.tenant_id, i.id AS institution_id, vo.baseline_value, vo.actual_value, vo.claimed_currency_impact,
                e.evidence_form::text, e.quote_text, e.locator, e.kind::text
           FROM value_outcome_evidence voe
           JOIN value_outcomes vo ON vo.id = voe.value_outcome_id
           JOIN institutions i ON i.id = vo.institution_id
           JOIN evidence e ON e.id = voe.evidence_id
          WHERE voe.value_outcome_id = $1 AND voe.evidence_id = $2 AND voe.withdrawn_at IS NULL
          FOR UPDATE OF voe`,
        [outcomeId, evidenceId],
      );
      if (!link || isOtherTenant(req, link.tenant_id, { table: 'value_outcomes', id: outcomeId })) {
        res.status(404).json({ message: `no current link of evidence ${evidenceId} to value outcome ${outcomeId}` });
        return;
      }
      tenantId = link.tenant_id;
      institutionId = link.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['supports', 'reason'],
        { endpoint, subjectTable: 'value_outcome_evidence', subjectId: null, tenantId, institutionId })) return;
      const supports = req.body.supports;
      const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
      if (!isSupports(supports)) {
        throw new Refusal(422, 'Say what the evidence supports: the baseline, the actual, the impact basis, the commitment or the verification.');
      }
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why the link is corrected, in at least ${MIN_REASON} characters.`);
      if (supports === link.supports) {
        throw new Refusal(422, `This link already supports ${SUPPORTS_WORD[supports]}; there is nothing to correct.`);
      }
      // C2: the commitment and the verification are acts a person attests to; only an attestation supports them.
      if (ACT_SUPPORTS.includes(supports) && link.kind !== 'attestation') {
        throw new Refusal(422, `Only an attestation supports ${SUPPORTS_WORD[supports]}; this evidence is not one.`);
      }
      // Withdraw first, then record the corrected link (C1-D1): one current link at a time.
      await client.query(
        `UPDATE value_outcome_evidence SET withdrawn_by_person_id = $3, withdrawn_at = now(), withdrawal_reason = $4
          WHERE value_outcome_id = $1 AND evidence_id = $2 AND supports = $5 AND withdrawn_at IS NULL`,
        [outcomeId, evidenceId, actor, reason, link.supports],
      );
      await client.query(
        `INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports, corrects_supports, corrected_by_person_id, correction_reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [outcomeId, evidenceId, supports, link.supports, actor, reason],
      );
      // P2: the withdrawal and the correcting link, as one act (the link is named by its outcome and evidence).
      await recordAct(client, req, 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support', {
        act: 'correct', tenantId: link.tenant_id, subjectTable: 'value_outcome_evidence', subjectId: outcomeId,
        resultTable: 'evidence', resultId: evidenceId, reason,
      });
      // The corrected link's figure check (P1), as outcome evidence's: a statement is not checkable;
      // a quote or a locator is checked when the figure exists; legacy evidence is not checked.
      // C2: the commitment and the verification support no figure, so nothing is checked for them
      // (commit and verify record none either).
      const field = supports === 'baseline' ? 'baseline_value' : supports === 'actual' ? 'actual_value' : 'claimed_currency_impact';
      const figure = link[field];
      if (!ACT_SUPPORTS.includes(supports as Supports) && link.evidence_form !== 'legacy' && (link.evidence_form === 'statement' || figure !== null)) {
        const checked = checkFigure({ numeric: figure === null ? null : Number(figure), text: null },
          { form: link.evidence_form as 'quote' | 'locator' | 'statement', quoteText: link.quote_text, locator: link.locator });
        await recordFigureCheck(client, {
          institutionId: link.institution_id, evidenceId, subjectTable: 'value_outcomes', subjectId: outcomeId,
          subjectField: field, valueChecked: figure, actorPersonId: actor,
        }, checked);
      }
      res.status(201).json({ value_outcome_id: outcomeId, evidence_id: evidenceId, withdrawn_supports: link.supports, supports });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'value_outcome_evidence', subjectId: null, tenantId, institutionId, valueOutcomeId: outcomeId });
    }
  });
  return router;
}

export function erratumRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:runId/errata', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/value-runs/:runId/errata';
    const client: PoolClient = req.dbClient!;
    const { runId } = req.params;
    if (!isUuid(runId)) {
      res.status(400).json({ message: `invalid run id: ${runId}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new Refusal(422, 'Say what the run got wrong, what is right, and why.');
      const { rows: [run] } = await client.query<{ tenant_id: string; locked_at: string | null; payload: Record<string, unknown>; institution_id: string | null }>(
        `SELECT r.tenant_id, r.locked_at, r.payload, g.institution_id
           FROM value_runs r LEFT JOIN engagements g ON g.id = r.engagement_id
          WHERE r.id = $1 AND r.deleted_at IS NULL`,
        [runId],
      );
      if (!run || isOtherTenant(req, run.tenant_id, { table: 'value_runs', id: runId })) {
        res.status(404).json({ message: `run ${runId} not found` });
        return;
      }
      tenantId = run.tenant_id;
      institutionId = run.institution_id;
      // C1-D3: the recompute is the server's; a score sent in the body is refused.
      if (await refuseUnknownFields(pool, req, res, ['evidence_id', 'what_was_wrong', 'what_is_right', 'reason', 'supersedes_erratum_id', 'supersession_reason'],
        { endpoint, subjectTable: 'run_errata', subjectId: null, tenantId, institutionId },
        (k) => (/score|band|recompute|model/.test(k) ? `body.${k} is not taken: the recompute is the server's, under the model the run was sealed with` : null))) return;
      if (run.locked_at === null) throw new Refusal(409, 'An erratum is recorded on a locked run; an unlocked run is replaced, not corrected.');
      const outcomeId = typeof run.payload.valueOutcomeId === 'string' ? run.payload.valueOutcomeId : null;
      if (!outcomeId) throw new Refusal(422, 'This run predates the link to its outcome, so no erratum can name what it sealed.');
      const b = req.body;
      const texts = { wrong: b.what_was_wrong, right: b.what_is_right, reason: b.reason };
      for (const [k, v] of Object.entries(texts)) {
        if (typeof v !== 'string' || v.trim().length < MIN_REASON) {
          throw new Refusal(422, `Say ${k === 'wrong' ? 'what was wrong' : k === 'right' ? 'what is right' : 'why'}, in at least ${MIN_REASON} characters.`);
        }
      }
      if (typeof b.evidence_id !== 'string' || !isUuid(b.evidence_id)) throw new Refusal(422, 'Name the evidence whose link was corrected.');
      const { rows: [ev] } = await client.query<{ kind: string; summary: string; provenance: string; supports_now: string | null }>(
        `SELECT e.kind::text, e.summary, e.provenance,
                (SELECT supports FROM value_outcome_evidence WHERE value_outcome_id = $2 AND evidence_id = e.id AND withdrawn_at IS NULL) AS supports_now
           FROM evidence e WHERE e.id = $1`,
        [b.evidence_id, outcomeId],
      );
      if (!ev || ev.supports_now === null) throw new Refusal(422, "That evidence has no current link to this run's outcome.");
      // C1 review (Brad, 25 Oct 2026): one erratum per run and correction. A later one supersedes
      // the current one, naming it, with a reason (run_errata_one_per_correction, _superseded_once).
      const { rows: [current] } = await client.query<{ id: string; recorded_on: string; recorded_by: string }>(
        `SELECT e.id, to_char(e.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recorded_on, p.full_name AS recorded_by
           FROM run_errata e JOIN persons p ON p.id = e.recorded_by_person_id
          WHERE e.value_run_id = $1 AND e.evidence_id = $2 AND e.corrected_to_supports = $3
            AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = e.id)`,
        [runId, b.evidence_id, ev.supports_now],
      );
      const supersedes = b.supersedes_erratum_id;
      const supersessionReason = typeof b.supersession_reason === 'string' ? b.supersession_reason.trim() : '';
      if (supersedes === undefined && b.supersession_reason !== undefined) {
        throw new Refusal(422, 'A supersession reason goes with the erratum it supersedes; name it.');
      }
      if (supersedes === undefined && current) {
        throw new Refusal(409, `An erratum for this correction is already recorded on this run (${current.recorded_on}, by ${current.recorded_by}); correct it with a new erratum that supersedes it, naming it, with a reason.`);
      }
      if (supersedes !== undefined) {
        if (typeof supersedes !== 'string' || !isUuid(supersedes)) throw new Refusal(422, 'Name the erratum this one supersedes.');
        if (!current) throw new Refusal(409, 'There is no erratum for this correction on this run to supersede.');
        if (supersedes !== current.id) {
          throw new Refusal(409, `That is not the current erratum for this correction on this run; the current one is ${current.id} (${current.recorded_on}, by ${current.recorded_by}).`);
        }
        if (supersessionReason.length < MIN_REASON) throw new Refusal(422, `Say why the erratum is superseded, in at least ${MIN_REASON} characters.`);
      }
      const rc = recomputeWithCorrection(run.payload as never, { kind: ev.kind, summary: ev.summary, provenance: ev.provenance }, ev.supports_now as Supports);
      // C2 (Brad, 25 Oct 2026): a seal that cannot be reproduced is recorded NOT RECOMPUTED, saying why; any other refusal stands.
      if (!rc.ok && !rc.notRecomputed) throw new Refusal(422, rc.reason);
      const r = rc.ok ? rc : { ...rc, score: null, band: null };
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, supersedes_id, supersession_reason,
           what_was_wrong, what_is_right, reason,
           model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
        [tenantId, runId, outcomeId, b.evidence_id, ev.supports_now, supersedes ?? null, supersedes === undefined ? null : supersessionReason,
          String(texts.wrong).trim(), String(texts.right).trim(), String(texts.reason).trim(),
          r.modelVersion, r.modelFingerprint, r.sealedScore, r.sealedBand, r.score, r.band, r.method, actor],
      );
      await recordAct(client, req, 'POST /api/value-runs/:runId/errata', {
        act: 'record_erratum', tenantId: tenantId!, subjectTable: 'run_errata', subjectId: row.id, evidenceIds: [b.evidence_id],
        reason: String(texts.reason).trim(),
      });
      res.status(201).json({ erratum_id: row.id, supersedes_erratum_id: supersedes ?? null, sealed_score: r.sealedScore, sealed_band: r.sealedBand, recomputed_score: r.score, recomputed_band: r.band, model_version: r.modelVersion, recompute_method: r.method });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'run_errata', subjectId: null, tenantId, institutionId });
    }
  });
  return router;
}
