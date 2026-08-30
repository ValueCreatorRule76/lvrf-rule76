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
  committerName: string;
  committerSimulated: boolean;
  verifierName: string;
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

  // 5 & 6. Human actors of record.
  for (const [factor, label, name, simulated] of [
    ['human_commit_of_record', 'Committer', input.committerName, input.committerSimulated],
    ['human_verifier_of_record', 'Verifier', input.verifierName, input.verifierSimulated],
  ] as const) {
    const weight = CONFIDENCE_FACTOR_WEIGHTS[factor];
    if (simulated) {
      award(factor, 0, `${label} of record is synthetic (${name}).`);
    } else {
      award(factor, weight, `${name} of record.`);
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
  };
}
