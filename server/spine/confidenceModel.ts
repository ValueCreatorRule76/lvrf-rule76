import { createHash } from 'node:crypto';
import type { CustomerZeroFixture, EvidenceFixture } from './fixture.js';

/**
 * LVRF Confidence Model — db/CONFIDENCE_MODEL.md is the canonical spec; this
 * is its one implementation. Previously existed only in
 * records/simulate_spine.py, which the client zero milestone retires.
 *
 * Confidence is computed. It is never asserted, and never estimated. The
 * computed band governs; any asserted value (value_outcomes.confidence) is
 * advisory and may disagree with it — that disagreement is surfaced via
 * `overridesAssertion`, never resolved by preferring the assertion.
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * Chosen so a flawless Use B record — definition confirmed, both sides
 * attested, basis evidenced, real sponsor, real verifier — scores exactly
 * 20 + 15 + 15 + 10 + 10 + 10 = 80, the floor of HIGH. Changing this constant
 * moves that ceiling and requires an amendment.
 */
export const ATTESTATION_CREDIT = 0.6;

const CONFIDENCE_FACTOR_WEIGHTS = {
  metric_definition_confirmed: 20,
  baseline_evidence_verified: 25,
  actual_evidence_verified: 25,
  impact_basis_evidenced: 10,
  human_commit_of_record: 10,
  human_verifier_of_record: 10,
} as const;

/** db/CONFIDENCE_MODEL.md's factor table — same text records/simulate_spine.py's CONFIDENCE_FACTORS pairs with each weight. */
const CONFIDENCE_FACTOR_QUESTIONS = {
  metric_definition_confirmed: "Is the metric's calculation method known and documented?",
  baseline_evidence_verified: 'Is the baseline supported by confirmed evidence?',
  actual_evidence_verified: 'Is the measured actual supported by confirmed evidence?',
  impact_basis_evidenced: "Is the currency figure's derivation stated and supported?",
  human_commit_of_record: 'Did a named, non-simulated person commit to this target?',
  human_verifier_of_record: 'Did a named, non-synthetic person verify the result?',
} as const;

type ConfidenceFactor = keyof typeof CONFIDENCE_FACTOR_WEIGHTS;

const CONFIDENCE_BANDS: ReadonlyArray<readonly [number, ConfidenceLevel]> = [
  [80, 'high'],
  [55, 'medium'],
  [0, 'low'],
];

/**
 * Two identifiers, not one, because they answer different questions and
 * neither can stand in for the other.
 *
 * MODEL_VERSION is a hand-declared string, for people — bumped deliberately
 * when the model changes. But a hand-maintained string is a CONVENTION, and
 * this codebase has already found four conventions (see CLAUDE.md's
 * amendments) that were not honoured as constraints. Nothing stops this
 * constant from going stale.
 *
 * MODEL_FINGERPRINT is computed, not written, over the model's own constants
 * — CONFIDENCE_FACTOR_WEIGHTS, CONFIDENCE_FACTOR_QUESTIONS, CONFIDENCE_BANDS,
 * ATTESTATION_CREDIT — at module load. It cannot be forgotten the way a
 * version bump can. It covers the QUESTIONS as well as the weights
 * deliberately: changing what a factor asks changes what a score means even
 * at an unchanged weight, which is exactly what happened on 30 August, when
 * human_commit_of_record's meaning moved from engagements.sponsor_person_id
 * to value_outcomes.committed_by_person_id in the same deploy as a commit
 * being recorded. But a fingerprint is not readable, so a human still needs
 * the declared version alongside it.
 *
 * If the two ever disagree — same declared MODEL_VERSION, different
 * MODEL_FINGERPRINT — THAT IS THE FINDING: someone changed a weight or a
 * question without amending the version. ATTESTATION_CREDIT's own comment
 * already says changing it "requires an amendment"; the fingerprint is what
 * makes that detectable rather than merely stated.
 *
 * Limitation, stated plainly: the fingerprint covers the model's constants.
 * It does NOT cover the DERIVATION — which column a caller reads to populate
 * an input. The 30 August change altered produceRun's derivation and one
 * question string; the question change would have been caught here, but a
 * pure derivation change (same question, same weight, different source
 * column) would not be. This is a partial detector, and knowing its edge
 * matters more than the coverage it does give.
 */
export const MODEL_VERSION = '1.0.0';

export const MODEL_FINGERPRINT = createHash('sha256')
  .update(
    JSON.stringify({
      weights: CONFIDENCE_FACTOR_WEIGHTS,
      questions: CONFIDENCE_FACTOR_QUESTIONS,
      bands: CONFIDENCE_BANDS,
      attestationCredit: ATTESTATION_CREDIT,
    }),
  )
  .digest('hex')
  .slice(0, 12);

export interface ConfidenceEvidenceInput {
  kind: string;
  sourceVerified: boolean;
  supports: 'baseline' | 'attach' | 'actual' | 'impact_basis';
  /** Name of the attester, if this evidence is an attestation. */
  attestedByName?: string | null;
  attestedByScope?: 'tenant' | 'institution' | null;
  /** Whether the named attester is a simulated identity, not a person of record. */
  attesterSimulated?: boolean;
}

export interface ConfidenceFactorRow {
  factor: ConfidenceFactor;
  question: string;
  weight: number;
  earned: number;
  note: string;
}

export interface ConfidenceResult {
  factors: ConfidenceFactorRow[];
  score: number;
  band: ConfidenceLevel;
  asserted: ConfidenceLevel | null;
  overridesAssertion: boolean;
  /** records/render_record.py's `c['method']` — checked against that file, not guessed. */
  method: string;
  /** See MODEL_VERSION above. Hand-declared; not present on runs scored before this existed. */
  modelVersion: string;
  /** See MODEL_FINGERPRINT above. Computed; not present on runs scored before this existed. */
  modelFingerprint: string;
}

const CONFIDENCE_METHOD =
  'Computed from the evidence ledger across six weighted factors. The computed band governs; any asserted value is advisory.';

/**
 * Why metricDefinitionConfirmed is false, so the factor's note can say
 * which of the three requirements is missing rather than just that it
 * failed. business_metrics.definition_confirmed_by_person_id /
 * definition_confirmed_at (migration 0013) pair by CHECK — a confirmation
 * without notes documents nothing, notes without a confirmer are
 * unattested, and a simulated confirmer is not a person of record, the
 * same rule lvrf_block_simulated_attestor enforces at the database.
 */
export type MetricDefinitionGap = 'no_notes' | 'unconfirmed' | 'confirmer_simulated';

const METRIC_DEFINITION_GAP_NOTES: Record<MetricDefinitionGap, string> = {
  no_notes: 'Calculation method NOT disclosed by the source. The metric cannot be independently reproduced.',
  unconfirmed:
    'Calculation method documented, but not confirmed by a named person. Notes without a confirmer are unattested.',
  confirmer_simulated:
    'Calculation method documented and confirmation recorded, but the confirming person is simulated — not a person of record.',
};

export interface ConfidenceInput {
  /**
   * Whether the metric's calculation method is documented AND confirmed by
   * a real, non-simulated person of record. The caller computes this — see
   * business_metrics.definition_confirmed_by_person_id /
   * definition_confirmed_at. No partial credit for any one of the three
   * alone.
   */
  metricDefinitionConfirmed: boolean;
  /**
   * Set only when metricDefinitionConfirmed is false, to select which of
   * METRIC_DEFINITION_GAP_NOTES applies. Optional and defaults to
   * 'no_notes': walkSpine.ts's fixture supplies only the boolean, and that
   * default reproduces the original, single message unchanged — Customer
   * Zero's score and note text are not affected by this field's addition.
   */
  metricDefinitionGap?: MetricDefinitionGap;
  evidence: ConfidenceEvidenceInput[];
  claimedCurrencyImpact: number | null;
  realizedCurrencyImpact: number | null;
  impactBasisStated: boolean;
  impactIsInference: boolean;
  /**
   * null when no person has been named at all — a distinct fact from
   * `committerSimulated`, which only means the named person is not a
   * person of record. Conflating the two used to manufacture a placeholder
   * name for a person who does not exist (creditNameForMissing, since
   * deleted from produceRun.ts); a nullable name says "absent" without
   * inventing a name to say it with, the same way every other field here
   * represents "nothing claimed" as null rather than a sentinel string.
   */
  committerName: string | null;
  committerSimulated: boolean;
  /** See committerName — same absent/simulated/real distinction, same reason. */
  verifierName: string | null;
  verifierSimulated: boolean;
  assertedConfidence: ConfidenceLevel | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Adapts one fixture evidence item to the model's input shape, resolving
 * `attested_by` (a key into `fixture.persons`, e.g. "metric_owner") to the
 * attester's name and scope. The one adapter, so the gate check
 * (server/spine/walkSpine.ts) and the confidence score never see a
 * differently-shaped evidence list.
 */
export function fixtureEvidenceToInput(fixture: CustomerZeroFixture, ev: EvidenceFixture): ConfidenceEvidenceInput {
  const attester = ev.attested_by ? fixture.persons[ev.attested_by as keyof typeof fixture.persons] : null;
  return {
    kind: ev.kind,
    sourceVerified: ev.source_verified,
    supports: ev.supports,
    attestedByName: attester?.name ?? null,
    attestedByScope: attester?.scope ?? null,
    attesterSimulated: attester?.synthetic ?? false,
  };
}

export function evidenceCredit(ev: ConfidenceEvidenceInput): { credit: number; note: string } {
  if (!ev.sourceVerified) return { credit: 0, note: 'unverified' };

  if (ev.kind === 'attestation' || ev.attestedByName) {
    const name = ev.attestedByName;
    if (!name) return { credit: 0, note: 'attestation with no named attester' };
    if (ev.attesterSimulated) return { credit: 0, note: `attester synthetic (${name})` };
    if (ev.attestedByScope !== 'institution') {
      return { credit: 0, note: `attester is vendor-side (${name}) — not an authority on the customer's metric` };
    }
    return { credit: ATTESTATION_CREDIT, note: `attested by ${name}` };
  }

  return { credit: 1, note: 'independently source-verified' };
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const rows: ConfidenceFactorRow[] = [];
  const award = (factor: ConfidenceFactor, earned: number, note: string) => {
    rows.push({
      factor,
      question: CONFIDENCE_FACTOR_QUESTIONS[factor],
      weight: CONFIDENCE_FACTOR_WEIGHTS[factor],
      earned: round1(earned),
      note,
    });
  };

  // 1. Metric definition confirmed — full weight or none, no partial credit.
  award(
    'metric_definition_confirmed',
    input.metricDefinitionConfirmed ? CONFIDENCE_FACTOR_WEIGHTS.metric_definition_confirmed : 0,
    input.metricDefinitionConfirmed
      ? 'Calculation method documented.'
      : METRIC_DEFINITION_GAP_NOTES[input.metricDefinitionGap ?? 'no_notes'],
  );

  // 2 & 3. Evidence strength by what it supports. Best item, not average.
  for (const [factor, supports] of [
    ['baseline_evidence_verified', 'baseline'],
    ['actual_evidence_verified', 'actual'],
  ] as const) {
    const weight = CONFIDENCE_FACTOR_WEIGHTS[factor];
    const rel = input.evidence.filter((e) => e.supports === supports);
    if (rel.length === 0) {
      award(factor, 0, `No evidence attached to the ${supports}.`);
      continue;
    }
    const graded = rel.map(evidenceCredit);
    const best = Math.max(...graded.map((g) => g.credit));
    const note = graded.find((g) => g.credit === best)!.note;
    const nAttested = graded.filter((g) => g.credit > 0 && g.credit < 1).length;
    const nIndependent = graded.filter((g) => g.credit >= 1).length;
    award(
      factor,
      weight * best,
      `${rel.length} item(s): ${nIndependent} independent, ${nAttested} attested. Strongest — ${note}.`,
    );
  }

  // 4. Impact basis.
  const impactWeight = CONFIDENCE_FACTOR_WEIGHTS.impact_basis_evidenced;
  if (input.claimedCurrencyImpact == null && input.realizedCurrencyImpact == null) {
    award('impact_basis_evidenced', impactWeight, 'No currency figure claimed — nothing to substantiate.');
  } else {
    const basisEvidence = input.evidence.filter((e) => e.supports === 'impact_basis');
    const graded = basisEvidence.map(evidenceCredit);
    const best = graded.length > 0 ? Math.max(...graded.map((g) => g.credit)) : 0;
    if (input.impactBasisStated && best > 0 && !input.impactIsInference) {
      const note = graded.find((g) => g.credit === best)!.note;
      award('impact_basis_evidenced', impactWeight, `Basis stated and evidenced — ${note}.`);
    } else if (input.impactBasisStated && best > 0) {
      award(
        'impact_basis_evidenced',
        impactWeight * 0.5,
        'Basis stated and evidenced, but self-declared as inference. Half credit.',
      );
    } else {
      award('impact_basis_evidenced', 0, 'Currency claimed without stated, evidenced basis.');
    }
  }

  // 5 & 6. Human actors of record. Three distinct facts, three distinct
  // notes — no person named, a named-but-simulated person, and a named real
  // person — rather than collapsing "absent" into "simulated" the way a
  // manufactured placeholder name used to.
  for (const [factor, verb, roleNoun, name, simulated] of [
    ['human_commit_of_record', 'Committed by', 'committer', input.committerName, input.committerSimulated],
    ['human_verifier_of_record', 'Verified by', 'verifier', input.verifierName, input.verifierSimulated],
  ] as const) {
    const weight = CONFIDENCE_FACTOR_WEIGHTS[factor];
    if (name == null) {
      award(factor, 0, `No ${roleNoun} of record has been named.`);
    } else if (simulated) {
      award(factor, 0, `${verb} ${name} — a simulated identity, not a person of record.`);
    } else {
      award(factor, weight, `${verb} ${name}.`);
    }
  }

  const score = round1(rows.reduce((sum, r) => sum + r.earned, 0));
  const band = CONFIDENCE_BANDS.find(([threshold]) => score >= threshold)![1];
  const asserted = input.assertedConfidence;

  return {
    factors: rows,
    score,
    band,
    asserted,
    overridesAssertion: asserted != null && asserted !== band,
    method: CONFIDENCE_METHOD,
    modelVersion: MODEL_VERSION,
    modelFingerprint: MODEL_FINGERPRINT,
  };
}
