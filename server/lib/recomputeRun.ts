import {
  computeConfidence, CONFIDENCE_FACTOR_WEIGHTS, MODEL_FINGERPRINT, MODEL_VERSION,
  type ConfidenceEvidenceInput, type ConfidenceInput,
} from '../spine/confidenceModel.js';
import { SUPPORTS_WORD, type Supports as SupportsValue } from './supports.js';

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
 * C2: an item moved to the commitment or the verification supports nothing a factor reads.
 *
 * C2 (Brad, 25 Oct 2026, after the dry run): when the SEAL cannot be reproduced — the run sealed
 * no model version, or its seal does not carry who attested an attested item — the result is
 * NOT RECOMPUTED rather than a refusal: the erratum is still recorded, with no score, saying why
 * (specific to the run), and, where the seal shows it, which sealed factor the item could feed and
 * that factor's sealed value, quoted from the seal. Nothing is invented. A run sealed under
 * another recorded model is still refused: M1 keeps every model's scorer, so it is recomputable.
 */
const word = (s: string) => SUPPORTS_WORD[s as SupportsValue] ?? s;

type Supports = ConfidenceEvidenceInput['supports'];
interface SealedFactor { factor: keyof typeof CONFIDENCE_FACTOR_WEIGHTS; earned: number; gap?: string | null; weight?: number; question?: string; note?: string }
interface SealedItem { kind: string; summary: string; provenance: string; supports: string; source_verified: boolean }
interface SealedPayload {
  confidence?: { score: number; band: string; modelVersion?: string; modelFingerprint?: string; factors?: SealedFactor[] };
  evidence?: SealedItem[];
  claimedCurrencyImpact?: number | null;
  realizedCurrencyImpact?: number | null;
}

export type Recompute =
  | { ok: true; score: number; band: string; sealedScore: number; sealedBand: string; modelVersion: string; modelFingerprint: string; method: string }
  | { ok: false; notRecomputed: true; reason: string; sealedScore: number; sealedBand: string; modelVersion: string | null; modelFingerprint: string | null; method: string }
  | { ok: false; notRecomputed?: false; reason: string };

/** Which sealed factor reads evidence of each support: the model's factors, by their keys. */
const FACTOR_OF: Partial<Record<string, SealedFactor['factor']>> = {
  baseline: 'baseline_evidence_verified', actual: 'actual_evidence_verified', impact_basis: 'impact_basis_evidenced',
};

export function recomputeWithCorrection(
  payload: SealedPayload,
  match: { kind: string; summary: string; provenance: string },
  supportsNow: Supports,
): Recompute {
  const c = payload.confidence;
  if (!c || !c.factors) return { ok: false, reason: 'This run sealed no confidence factors, so it cannot be recomputed.' };
  const sealedItems = payload.evidence;
  if (!sealedItems) return { ok: false, reason: 'This run sealed no evidence, so it cannot be recomputed.' };
  const hits = sealedItems.filter((e) => e.kind === match.kind && e.summary === match.summary && e.provenance === match.provenance);
  if (hits.length !== 1) {
    return { ok: false, reason: `The corrected evidence appears ${hits.length} times in this run's sealed evidence, not once; nothing is stated.` };
  }
  const before = hits[0].supports;
  if (before === supportsNow) {
    return { ok: false, reason: `This run sealed that evidence as support for ${word(before)}, which is what its link supports now: there is no correction to state. Nothing is stated.` };
  }
  // What the seal itself shows of the factor the item could feed, quoted; nothing when it shows none.
  const fed = FACTOR_OF[before] ? c.factors.find((f) => f.factor === FACTOR_OF[before]) : undefined;
  const fedLine = fed && fed.question && typeof fed.weight === 'number'
    ? ` Sealed as support for ${word(before)}, it could feed only the sealed factor asking "${fed.question}", sealed at ${Number(fed.earned)} of ${fed.weight}${fed.note ? `: "${fed.note}"` : ''}.`
    : '';
  const notRecomputed = (why: string): Recompute => ({
    ok: false, notRecomputed: true, reason: why, sealedScore: Number(c.score), sealedBand: c.band,
    modelVersion: c.modelVersion ?? null, modelFingerprint: c.modelVersion ? (c.modelFingerprint ?? null) : null,
    method: `Not recomputed: ${why}${fedLine} The sealed run is unchanged.`,
  });
  if (!c.modelVersion) {
    return notRecomputed(`this run sealed no model version, so the model it was sealed with cannot be named (${c.score} / 100 as sealed).`);
  }
  if (c.modelVersion !== MODEL_VERSION || c.modelFingerprint !== MODEL_FINGERPRINT) {
    return { ok: false, reason: `This run was sealed under model ${c.modelVersion} (${c.modelFingerprint ?? 'no fingerprint'}); this server's model is ${MODEL_VERSION} (${MODEL_FINGERPRINT}). It cannot be recomputed under the model it was sealed with.` };
  }

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
    // Which sealed factors the seal's own evidence does not reproduce, and whether the seal says each was attested.
    const unrep = computeConfidence(input(sealedItems, true)).factors.filter((f) => f.earned !== earned(f.factor)).map((f) => sealed.get(f.factor)!);
    const attested = unrep.length > 0 && unrep.every((f) => f.gap === 'attested_only' || /\battested\b/.test(f.note ?? ''));
    const named = unrep.map((f) => `"${f.question ?? f.factor}" (sealed at ${Number(f.earned)})`).join(', ');
    return notRecomputed(attested
      ? `this run's seal does not carry who attested its attested evidence, so ${named} cannot be reproduced from the seal under model ${MODEL_VERSION} (${c.score} / 100 as sealed).`
      : `this run's sealed evidence does not reproduce its sealed score (${c.score} / 100) under model ${MODEL_VERSION}${named ? `: ${named}` : ''}.`);
  }
  const corrected = sealedItems.map((e) => (e === hits[0] ? { ...e, supports: supportsNow } : e));
  const r = computeConfidence(input(corrected, stated));
  return {
    ok: true, score: r.score, band: r.band, sealedScore: Number(c.score), sealedBand: c.band,
    modelVersion: MODEL_VERSION, modelFingerprint: MODEL_FINGERPRINT,
    method: `Recomputed under model ${MODEL_VERSION} (${MODEL_FINGERPRINT}), the model this run was sealed with, from its sealed evidence with "${match.summary.slice(0, 80)}" counted as support for ${word(supportsNow)}, not ${word(before)}; every other factor as sealed. The sealed run is unchanged.`,
  };
}
