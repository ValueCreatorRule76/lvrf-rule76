import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import {
  computeConfidence,
  buildConfidenceInput,
  type ConfidenceEvidenceInput,
  type RawEvidenceForConfidence,
} from '../spine/confidenceModel.js';

/**
 * GET /api/value-outcomes/:outcomeId/gaps — LVRF 2.0 item 2, part C.
 *
 * THE GAP REGISTER IS A CURRENT VIEW, NOT PART OF THE RECORD. A value_runs
 * payload holds the confidence factors as they stood WHEN THAT RUN WAS
 * PRODUCED — a locked run is a photograph (see produceRun.ts). This endpoint
 * recomputes confidence for the outcome AS IT STANDS RIGHT NOW, using
 * buildConfidenceInput — the SAME derivation produceRun.ts uses to score a
 * live outcome, not a second copy of it. Rendering a fresh plan next to a
 * frozen score would be exactly the incoherence a locked record's disclosure
 * gate exists to prevent, so this route never reads a value_runs.payload —
 * only the outcome's live rows.
 *
 * NOT PRICED. There is no cost or duration estimate on any entry, because
 * the system has no basis for one and inventing a figure is the one thing
 * this instrument refuses to do (see CLAUDE.md's governing AI principle).
 * The price IS the requirement, stated precisely enough to act on.
 *
 * This is a read: actorContext returns early on GET and never sets
 * req.dbClient, so this queries the pool directly, same as persons.ts.
 */

class GapRegisterError extends Error {}

type AskType = 'definition' | 'document' | 'person';
type GapState = 'open' | 'refused' | 'structurally_unobtainable';

const ASK_TYPE_BY_GAP: Record<string, AskType> = {
  no_notes: 'definition',
  unconfirmed: 'definition',
  confirmer_simulated: 'definition',
  none_attached: 'document',
  evidence_unqualified: 'document',
  attested_only: 'document',
  absent: 'person',
  simulated: 'person',
  unsubstantiated: 'definition',
  self_declared_inference: 'definition',
};

// Nobody signs their name to a figure whose definition was not agreed, and
// no extract can be gathered until both sides agree what the number counts.
// This ordering — not weight, not factor, not anything else — is the
// register's real output: a sequence a conversation can follow.
const ASK_TYPE_ORDER: Record<AskType, number> = { definition: 0, document: 1, person: 2 };

const EVIDENCE_ENDPOINT = 'POST /api/value-outcomes/:outcomeId/evidence';

/**
 * WHY REFUSED IS OPEN FOR MOST ASKS TODAY — read this before "fixing" it.
 *
 * 'refused' means the gate said no to an actual attempt: a row in
 * `refusals`, which only fills from a CHECK/unique-constraint violation
 * caught by handleGovernanceError (server/lib/refusal.ts). Checked against
 * the live route code, not assumed:
 *
 *   - metric_definition_confirmed's three gaps: business_metrics carries no
 *     lvrf_block_simulated_attestor-style trigger (that trigger's own branch
 *     list is assessments/evidence/value_outcomes only — confirmed in
 *     db/hardening.sql). validateMetric.ts's confirmer check
 *     (server/routes/validateMetric.ts:202-207) is a plain res.status(422)
 *     before the INSERT, never routed through handleGovernanceError. No
 *     constraint corresponds to any of no_notes/unconfirmed/
 *     confirmer_simulated, so nothing in `refusals` could ever be attributed
 *     to one of these three without guessing at an unrelated refusal on the
 *     same subject (e.g. a name collision) — misattribution, not precision.
 *   - impact_basis_evidenced: no route in this codebase writes
 *     claimed_currency_impact, realized_currency_impact, or impact_basis on
 *     value_outcomes today (checked: only produceRun.ts reads them). A
 *     value_outcomes_impact_requires_basis violation cannot occur through
 *     any live endpoint yet, so 'unsubstantiated' is always 'open'; there is
 *     no write path for self_declared_inference to be refused by either,
 *     since nothing gates it.
 *   - human_commit_of_record / human_verifier_of_record: the simulated-actor
 *     checks in outcomeWalk.ts's /commit and /verify (lines ~178 and ~508)
 *     are the same shape — a plain 422 before the write, not a governance
 *     refusal. 'absent' is never a refusal at all: nobody having named
 *     anyone is not a rejected attempt.
 *
 * The one ask_type with a real, live, governance-refusable path is
 * 'document': POST /api/value-outcomes/:outcomeId/evidence routes every
 * CHECK/unique violation (including lvrf_block_ai_actual) through
 * handleGovernanceError. That is the only place this route queries
 * `refusals` for anything but a match that can never occur.
 */
function alwaysOpen(): { state: GapState; refusalMessage: string | null; refusedAt: string | null } {
  return { state: 'open', refusalMessage: null, refusedAt: null };
}

interface RefusalRow {
  message: string;
  refused_at: Date;
}

/**
 * lvrf_block_ai_actual raises via RAISE EXCEPTION ... USING ERRCODE, which
 * does not populate a constraint name — checked against db/hardening.sql,
 * not assumed. So this cannot filter by constraint_name the way a real
 * table CHECK could; it matches on endpoint + which side (baseline/actual)
 * the attempt supported, read back out of attempted_payload. Any refusal on
 * this exact path (AI-sourced, an incomplete attestation pair, a duplicate
 * link) is legitimately "an attempt to attach evidence for this factor was
 * refused" — the verbatim message is what disambiguates which.
 *
 * INSTITUTION-SCOPED, NOT OUTCOME-SCOPED — a real limitation, not an
 * oversight. Neither `refusals.subject_id` (the evidence row, which never
 * persists — the whole request's transaction rolls back on refusal) nor
 * `attempted_payload` (the request body, which carries no outcome id — that
 * comes from the URL) names the outcome an evidence-attach attempt targeted.
 * institution_id is the closest scope the stored row actually carries.
 * Callers must confirm this is the institution's only live outcome before
 * calling this — see the outcome-count guard in the route handler.
 */
async function findEvidenceRefusal(
  pool: Pool,
  institutionId: string,
  supports: 'baseline' | 'actual',
): Promise<RefusalRow | null> {
  const { rows } = await pool.query<RefusalRow>(
    `SELECT message, refused_at FROM refusals
      WHERE subject_table = 'evidence'
        AND endpoint = $1
        AND institution_id = $2
        AND attempted_payload ->> 'supports' = $3
      ORDER BY refused_at DESC
      LIMIT 1`,
    [EVIDENCE_ENDPOINT, institutionId, supports],
  );
  return rows[0] ?? null;
}

interface RawActualEvidenceDoor {
  ai_sourced: boolean;
  simulated: boolean;
  kind: string;
  ai_assisted: boolean | null;
}

/**
 * lvrf_block_ai_actual's four doors (db/hardening.sql), read back for every
 * evidence row currently supporting 'actual' on this outcome. ai_assisted
 * comes from the linked assessment, not evidence itself — the same
 * assessment_id join the trigger uses. If evidence exists and every row
 * fails at least one door, no amount of further attestation or
 * source-verification work on THESE ROWS closes actual_evidence_verified —
 * a genuinely different source is required. An empty set is not this case;
 * see the 'open' comment at the call site.
 */
async function actualEvidenceAllInadmissible(pool: Pool, outcomeId: string): Promise<boolean> {
  const { rows } = await pool.query<RawActualEvidenceDoor>(
    `SELECT e.ai_sourced, e.simulated, e.kind, a.ai_assisted
       FROM value_outcome_evidence voe
       JOIN evidence e ON e.id = voe.evidence_id
       LEFT JOIN assessments a ON a.id = e.assessment_id
      WHERE voe.value_outcome_id = $1 AND voe.supports = 'actual'`,
    [outcomeId],
  );
  if (rows.length === 0) return false; // nobody has tried — that's 'open', not unobtainable.
  return rows.every((r) => r.ai_sourced || Boolean(r.ai_assisted) || r.simulated || r.kind === 'vendor_publication');
}

const STRUCTURAL_ACTUAL_REQUIREMENT = (metricName: string): string =>
  `Every item currently attached to the actual value of "${metricName}" is inadmissible under ` +
  "AMENDMENT-005 Article I (AI-sourced, from an AI-assisted assessment, simulated, or vendor-published). " +
  'No amount of further attestation or verification on these items closes this — the actual must come ' +
  "from a different source: an export from the customer's own system of record.";

function buildRequirement(factor: string, gap: string, metricName: string): string {
  switch (factor) {
    case 'metric_definition_confirmed':
      switch (gap) {
        case 'no_notes':
          return `The calculation method for "${metricName}" must be documented — how it is computed and from what source.`;
        case 'unconfirmed':
          return `The documented calculation method for "${metricName}" must be confirmed by a named, non-simulated person of record.`;
        case 'confirmer_simulated':
          return `"${metricName}"'s calculation method must be confirmed by a real person of record — the current confirmation names a simulated identity.`;
      }
      break;
    case 'baseline_evidence_verified':
    case 'actual_evidence_verified': {
      const supports = factor === 'baseline_evidence_verified' ? 'baseline' : 'actual';
      switch (gap) {
        case 'none_attached':
          return `Evidence supporting the ${supports} value of "${metricName}" must be attached.`;
        case 'evidence_unqualified':
          return (
            `The evidence attached to the ${supports} of "${metricName}" must be independently source-verified, ` +
            'or attested by a named, institution-scoped, non-simulated person — none currently qualifies.'
          );
        case 'attested_only':
          return (
            `An independently source-verified extract for the ${supports} of "${metricName}" is needed for full ` +
            'credit — the current evidence is attestation-only.'
          );
      }
      break;
    }
    case 'impact_basis_evidenced':
      switch (gap) {
        case 'unsubstantiated':
          return 'The derivation of the claimed currency impact must be stated and supported by evidence.';
        case 'self_declared_inference':
          return 'The derivation of the claimed currency impact must be a measured basis, not a self-declared inference, for full credit.';
      }
      break;
    case 'human_commit_of_record':
      switch (gap) {
        case 'absent':
          return "A named, non-simulated person of record must commit to this outcome's target.";
        case 'simulated':
          return 'The committer of record must be a real person — the person currently named is a simulated identity.';
      }
      break;
    case 'human_verifier_of_record':
      switch (gap) {
        case 'absent':
          return "A named, non-simulated person of record must verify this outcome's result.";
        case 'simulated':
          return 'The verifier of record must be a real person — the person currently named is a simulated identity.';
      }
      break;
  }
  throw new GapRegisterError(`no requirement text defined for factor=${factor} gap=${gap}`);
}

export function gapRegisterRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:outcomeId/gaps', async (req, res) => {
    const outcomeId = req.params.outcomeId;
    if (!isUuid(outcomeId)) {
      res.status(400).json({ message: `invalid value outcome id: ${outcomeId}` });
      return;
    }

    try {
      const { rows: [vo] } = await pool.query<{
        id: string;
        institution_id: string;
        business_metric_id: string;
        claimed_currency_impact: string | null;
        realized_currency_impact: string | null;
        impact_basis: string | null;
        committed_by_person_id: string | null;
        verified_by_person_id: string | null;
        confidence: 'low' | 'medium' | 'high';
      }>(
        `SELECT id, institution_id, business_metric_id,
                claimed_currency_impact, realized_currency_impact, impact_basis,
                committed_by_person_id, verified_by_person_id, confidence
           FROM value_outcomes
          WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [outcomeId],
      );
      if (!vo) {
        res.status(404).json({ message: `value outcome ${outcomeId} not found` });
        return;
      }

      // Same shape as produceRun.ts's bm query, plus bm.name — needed here
      // to state a requirement precisely, not to score anything.
      const { rows: [bm] } = await pool.query<{
        name: string;
        definition_notes: string | null;
        definition_confirmed_by_person_id: string | null;
        definition_confirmed_at: Date | null;
        confirmer_simulated: boolean | null;
      }>(
        `SELECT bm.name, bm.definition_notes, bm.definition_confirmed_by_person_id,
                bm.definition_confirmed_at, p.simulated AS confirmer_simulated
           FROM business_metrics bm
           LEFT JOIN persons p ON p.id = bm.definition_confirmed_by_person_id
          WHERE bm.id = $1 AND bm.deleted_at IS NULL`,
        [vo.business_metric_id],
      );
      if (!bm) {
        // NOT NULL, ON DELETE RESTRICT — reachable only if soft-deleted after linking.
        throw new Error(`value outcome ${vo.id} references a soft-deleted business metric`);
      }

      // Same shape as produceRun.ts's evidence query — see buildConfidenceInput
      // for why this is the one derivation, not a second copy of it.
      const { rows: evidenceRows } = await pool.query<{
        kind: string;
        source_verified: boolean;
        supports: string;
        attester_name: string | null;
        attester_institution_id: string | null;
        attester_simulated: boolean | null;
      }>(
        `SELECT e.kind, e.source_verified, voe.supports,
                p.full_name AS attester_name, p.institution_id AS attester_institution_id,
                p.simulated AS attester_simulated
           FROM value_outcome_evidence voe
           JOIN evidence e ON e.id = voe.evidence_id
           LEFT JOIN persons p ON p.id = e.attested_by_person_id
          WHERE voe.value_outcome_id = $1
          ORDER BY e.created_at`,
        [vo.id],
      );
      const rawEvidenceForConfidence: RawEvidenceForConfidence[] = evidenceRows.map((r) => ({
        kind: r.kind,
        sourceVerified: r.source_verified,
        supports: r.supports as ConfidenceEvidenceInput['supports'],
        attesterName: r.attester_name,
        attesterInstitutionId: r.attester_institution_id,
        attesterSimulated: r.attester_simulated,
      }));

      // Same committer/verifier resolution as produceRun.ts: a null id, or
      // an id whose person row is gone, both read as absent — see
      // buildConfidenceInput's committerName/committerSimulated contract.
      let committerName: string | null = null;
      let committerSimulated = true;
      if (vo.committed_by_person_id) {
        const { rows: [committer] } = await pool.query<{ full_name: string; simulated: boolean }>(
          'SELECT full_name, simulated FROM persons WHERE id = $1 AND deleted_at IS NULL',
          [vo.committed_by_person_id],
        );
        committerName = committer ? committer.full_name : null;
        committerSimulated = !committer || committer.simulated;
      }
      let verifierName: string | null = null;
      let verifierSimulated = true;
      if (vo.verified_by_person_id) {
        const { rows: [verifier] } = await pool.query<{ full_name: string; simulated: boolean }>(
          'SELECT full_name, simulated FROM persons WHERE id = $1 AND deleted_at IS NULL',
          [vo.verified_by_person_id],
        );
        verifierName = verifier ? verifier.full_name : null;
        verifierSimulated = !verifier || verifier.simulated;
      }

      const confidenceInput = buildConfidenceInput({
        metricDefinitionNotes: bm.definition_notes,
        metricDefinitionConfirmedByPersonId: bm.definition_confirmed_by_person_id,
        metricDefinitionConfirmedAt: bm.definition_confirmed_at,
        metricDefinitionConfirmerSimulated: bm.confirmer_simulated,
        evidence: rawEvidenceForConfidence,
        claimedCurrencyImpact: vo.claimed_currency_impact === null ? null : Number(vo.claimed_currency_impact),
        realizedCurrencyImpact: vo.realized_currency_impact === null ? null : Number(vo.realized_currency_impact),
        impactBasisStated: Boolean(vo.impact_basis),
        committerName,
        committerSimulated,
        verifierName,
        verifierSimulated,
        assertedConfidence: vo.confidence,
      });
      const confidence = computeConfidence(confidenceInput);

      const gapFactors = confidence.factors.filter((f) => f.gap !== null);

      // Lazy, computed at most once each, only if a gap that needs them exists.
      let singleOutcomeAtInstitution: boolean | null = null;
      const isSingleOutcomeAtInstitution = async (): Promise<boolean> => {
        if (singleOutcomeAtInstitution === null) {
          const { rows: [{ n }] } = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM value_outcomes
              WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
            [vo.institution_id],
          );
          singleOutcomeAtInstitution = n <= 1;
        }
        return singleOutcomeAtInstitution;
      };

      let actualInadmissible: boolean | null = null;
      const isActualEvidenceAllInadmissible = async (): Promise<boolean> => {
        if (actualInadmissible === null) {
          actualInadmissible = await actualEvidenceAllInadmissible(pool, vo.id);
        }
        return actualInadmissible;
      };

      const entries = await Promise.all(
        gapFactors.map(async (f) => {
          const gap = f.gap as string;
          const askType = ASK_TYPE_BY_GAP[gap];
          if (!askType) {
            throw new GapRegisterError(`no ask_type mapped for gap discriminant "${gap}" (factor ${f.factor})`);
          }

          let requirement = buildRequirement(f.factor, gap, bm.name);
          let resolved: { state: GapState; refusalMessage: string | null; refusedAt: string | null };

          if (f.factor === 'actual_evidence_verified' && (await isActualEvidenceAllInadmissible())) {
            requirement = STRUCTURAL_ACTUAL_REQUIREMENT(bm.name);
            resolved = { state: 'structurally_unobtainable', refusalMessage: null, refusedAt: null };
          } else if (f.factor === 'baseline_evidence_verified' || f.factor === 'actual_evidence_verified') {
            const supports = f.factor === 'baseline_evidence_verified' ? 'baseline' : 'actual';
            if (await isSingleOutcomeAtInstitution()) {
              const refusal = await findEvidenceRefusal(pool, vo.institution_id, supports);
              resolved = refusal
                ? { state: 'refused', refusalMessage: refusal.message, refusedAt: refusal.refused_at.toISOString() }
                : alwaysOpen();
            } else {
              // More than one live outcome at this institution — a
              // refusal on this endpoint cannot be attributed to THIS
              // outcome without guessing. See findEvidenceRefusal's comment.
              resolved = alwaysOpen();
            }
          } else {
            // metric_definition_confirmed's three gaps, both
            // impact_basis_evidenced gaps, and both person asks — see the
            // "WHY REFUSED IS OPEN" comment above this router.
            resolved = alwaysOpen();
          }

          const personsOnRecordPromise =
            askType === 'person'
              ? pool.query<{ id: string; full_name: string }>(
                  `SELECT id, full_name FROM persons
                    WHERE institution_id = $1 AND simulated = false
                      AND deleted_at IS NULL AND superseded_by_id IS NULL
                    ORDER BY full_name`,
                  [vo.institution_id],
                )
              : null;
          const personsOnRecord = personsOnRecordPromise ? (await personsOnRecordPromise).rows : null;

          return {
            factor: f.factor,
            question: f.question,
            weight: f.weight,
            earned: f.earned,
            gap,
            ask_type: askType,
            requirement,
            earns: Math.round((f.weight - f.earned) * 10) / 10,
            state: resolved.state,
            refusal_message: resolved.refusalMessage,
            refused_at: resolved.refusedAt,
            ...(personsOnRecord !== null
              ? { persons_on_record: personsOnRecord.map((p) => ({ id: p.id, full_name: p.full_name })) }
              : {}),
          };
        }),
      );

      entries.sort((a, b) => ASK_TYPE_ORDER[a.ask_type] - ASK_TYPE_ORDER[b.ask_type]);

      res.status(200).json(entries);
    } catch (err) {
      if (err instanceof GapRegisterError) {
        res.status(500).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
