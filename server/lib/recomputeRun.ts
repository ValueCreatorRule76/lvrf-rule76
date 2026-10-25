import {
  computeConfidence, CONFIDENCE_FACTOR_WEIGHTS, MODEL_FINGERPRINT, MODEL_VERSION,
  type ConfidenceEvidenceInput, type ConfidenceInput,
} from '../spine/confidenceModel.js';

/**
 * C1 (LVRF_PLAN §9; C1-D3, Brad, 25 Oct 2026) — a sealed run's confidence,
 * recomputed READ-ONLY with one evidence link corrected, for an erratum. The
 * sealed run is never touched; the erratum states the result beside the
 * sealed score.
 *
 * Three refusals, each a plain sentence (never a guess):
 *   - the run was sealed under another MODEL_VERSION or fingerprint than this
 *     server's model: it cannot be recomputed under the model it was sealed with;
 *   - the sealed evidence does not REPRODUCE the sealed factors: recomputing the
 *     run unchanged must give exactly the sealed earned points on every factor
 *     (an attested item, whose attester the snapshot does not carry, fails here);
 *   - the corrected evidence is not found in the sealed snapshot exactly once;
 *   - the run sealed it as it is linked now: there is no correction to state.
 * The factors that read no evidence (the metric's definition, the committer,
 * the verifier) are reproduced from the sealed rows themselves; the impact
 * basis's "stated" flag is the one of the two values that reproduces the seal.
 */

type Supports = ConfidenceEvidenceInput['supports'];
interface SealedFactor { factor: keyof typeof CONFIDENCE_FACTOR_WEIGHTS; earned: number; gap?: string | null }
interface SealedItem { kind: string; summary: string; provenance: string; supports: string; source_verified: boolean }
interface SealedPayload {
  confidence?: { score: number; band: string; modelVersion?: string; modelFingerprint?: string; factors?: SealedFactor[] };
  evidence?: SealedItem[];
  claimedCurrencyImpact?: number | null;
  realizedCurrencyImpact?: number | null;
}

export type Recompute =
  | { ok: true; score: number; band: string; sealedScore: number; sealedBand: string; modelVersion: string; modelFingerprint: string; method: string }
  | { ok: false; reason: string };

export function recomputeWithCorrection(
  payload: SealedPayload,
  match: { kind: string; summary: string; provenance: string },
  supportsNow: Supports,
): Recompute {
  const c = payload.confidence;
  if (!c || !c.factors) return { ok: false, reason: 'This run sealed no confidence factors, so it cannot be recomputed.' };
  if (c.modelVersion !== MODEL_VERSION || c.modelFingerprint !== MODEL_FINGERPRINT) {
    return { ok: false, reason: `This run was sealed under model ${c.modelVersion ?? '(unrecorded)'} (${c.modelFingerprint ?? 'no fingerprint'}); this server's model is ${MODEL_VERSION} (${MODEL_FINGERPRINT}). It cannot be recomputed under the model it was sealed with.` };
  }
  const sealedItems = payload.evidence;
  if (!sealedItems) return { ok: false, reason: 'This run sealed no evidence, so it cannot be recomputed.' };

  const sealed = new Map(c.factors.map((f) => [f.factor, f]));
  const earned = (k: SealedFactor['factor']) => sealed.get(k)?.earned ?? 0;
  const full = (k: SealedFactor['factor']) => earned(k) === CONFIDENCE_FACTOR_WEIGHTS[k];
  const actor = (k: 'human_commit_of_record' | 'human_verifier_of_record') =>
    full(k) ? { name: 'the person of record', simulated: false } : sealed.get(k)?.gap === 'simulated' ? { name: 'a simulated identity', simulated: true } : { name: null, simulated: false };
  const commit = actor('human_commit_of_record');
  const verify = actor('human_verifier_of_record');

  const input = (items: SealedItem[], impactBasisStated: boolean): ConfidenceInput => ({
    metricDefinitionConfirmed: full('metric_definition_confirmed'),
    metricDefinitionGap: full('metric_definition_confirmed') ? undefined : ((sealed.get('metric_definition_confirmed')?.gap ?? 'no_notes') as ConfidenceInput['metricDefinitionGap']),
    evidence: items.map((e) => ({ kind: e.kind, sourceVerified: e.source_verified, supports: e.supports as Supports, attestedByName: null, attestedByScope: null, attesterSimulated: false })),
    claimedCurrencyImpact: payload.claimedCurrencyImpact ?? null,
    realizedCurrencyImpact: payload.realizedCurrencyImpact ?? null,
    impactBasisStated,
    impactIsInference: true,
    committerName: commit.name, committerSimulated: commit.simulated,
    verifierName: verify.name, verifierSimulated: verify.simulated,
    assertedConfidence: null,
  });
  const reproduces = (r: ReturnType<typeof computeConfidence>) =>
    r.factors.every((f) => f.earned === earned(f.factor)) && r.score === Number(c.score) && r.band === c.band;

  // The seal, reproduced first: if the sealed evidence does not give the sealed score, nothing is stated.
  const stated = [true, false].find((b) => reproduces(computeConfidence(input(sealedItems, b))));
  if (stated === undefined) {
    return { ok: false, reason: `This run's sealed evidence does not reproduce its sealed score (${c.score} / 100) under model ${MODEL_VERSION}: an attested item, whose attester the seal does not carry, cannot be reconstructed. Nothing is stated.` };
  }
  const hits = sealedItems.filter((e) => e.kind === match.kind && e.summary === match.summary && e.provenance === match.provenance);
  if (hits.length !== 1) {
    return { ok: false, reason: `The corrected evidence appears ${hits.length} times in this run's sealed evidence, not once; nothing is stated.` };
  }
  const before = hits[0].supports;
  if (before === supportsNow) {
    return { ok: false, reason: `This run sealed that evidence as support for the ${before.replace('_', ' ')}, which is what its link supports now: there is no correction to state. Nothing is stated.` };
  }
  const corrected = sealedItems.map((e) => (e === hits[0] ? { ...e, supports: supportsNow } : e));
  const r = computeConfidence(input(corrected, stated));
  return {
    ok: true, score: r.score, band: r.band, sealedScore: Number(c.score), sealedBand: c.band,
    modelVersion: MODEL_VERSION, modelFingerprint: MODEL_FINGERPRINT,
    method: `Recomputed under model ${MODEL_VERSION} (${MODEL_FINGERPRINT}), the model this run was sealed with, from its sealed evidence with "${match.summary.slice(0, 80)}" counted as support for the ${supportsNow.replace('_', ' ')}, not the ${before.replace('_', ' ')}; every other factor as sealed. The sealed run is unchanged.`,
  };
}
