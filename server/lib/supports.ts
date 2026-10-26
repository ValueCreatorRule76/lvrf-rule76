/**
 * What an evidence link supports, and how each reads (C2, LVRF_PLAN §11; Brad, 25 Oct 2026).
 * The values are the CHECK's (value_outcome_evidence_supports_known); this list is what the
 * routes accept and how a sentence names them. A commitment's and a verification's attestation
 * support those acts: no confidence factor reads them (computeConfidence reads only baseline,
 * actual and impact_basis).
 */
export const SUPPORTS = ['baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'] as const;
export type Supports = (typeof SUPPORTS)[number];
export const SUPPORTS_WORD: Record<Supports, string> = {
  baseline: 'the baseline', actual: 'the actual', impact_basis: 'the impact basis',
  target_commitment: 'the commitment', verification: 'the verification',
};
/** The two that are acts, not figures: written only by commit and verify, or by a steward's correction. */
export const ACT_SUPPORTS: readonly Supports[] = ['target_commitment', 'verification'];
export const isSupports = (v: unknown): v is Supports => typeof v === 'string' && (SUPPORTS as readonly string[]).includes(v);
