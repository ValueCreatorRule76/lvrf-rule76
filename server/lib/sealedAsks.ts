import { askFor, type CaseAsk } from './caseQuestions.js';

/**
 * What a sealed run asks for, read from its payload alone: the value case's "What we need from you" (B3, §19) and S7b's
 * story ("The results story waiting to be earned", §27 D8) read this one definition, so the two cannot drift. Moved
 * from server/routes/valueCase.ts unchanged.
 */
const BASIS_RANK: Record<string, number> = { system_of_record: 5, published: 4, client_stated: 3, inferred: 2, assumed: 1 };
export const rank = (b: string | null | undefined) => (b ? BASIS_RANK[b] ?? 0 : 0);

export interface SealedEvidence { kind: string; summary: string; provenance: string | null; source_reference: string | null; supports: string; basis: string | null;
  figure_check?: { result: string; detail: string } | null; simulated?: boolean }

/** The strongest sealed basis behind one support (baseline, actual, impact basis), or null when none is sealed. */
export function bestOf(evidence: SealedEvidence[], supports: string): SealedEvidence | null {
  const items = evidence.filter((e) => e.supports === supports);
  return items.sort((a, b) => rank(b.basis) - rank(a.basis))[0] ?? null;
}

/** The sealed run's asks, in spine order, and the vendor's own gaps kept apart. */
export function sealedAsks(p: Record<string, any>, account: string): { asks: (CaseAsk & { code: string })[]; vendorGaps: (CaseAsk & { code: string })[] } {
  const version: number = Number(p.payloadVersion ?? 1);
  const sealedCase = (p.case ?? null) as Record<string, any> | null;
  const evidence = (Array.isArray(p.evidence) ? p.evidence : []) as SealedEvidence[];
  const metric: string = p.businessMetric?.name ?? (typeof p.businessMetric === 'string' ? p.businessMetric : 'the metric');
  const unit: string | null = p.businessMetric?.unit ?? null;
  const baseline = bestOf(evidence, 'baseline');
  const cod = version >= 5 ? sealedCase?.cost_of_delay ?? null : null;
  const codes: string[] = [];
  if (!baseline || baseline.basis !== 'system_of_record') codes.push('baseline_not_system_of_record');
  for (const reason of (cod?.reasons ?? []) as { code: string }[]) codes.push(reason.code);
  if (p.targetValue === null || p.targetValue === undefined) codes.push('no_commitment');
  if (p.actualValue === null || p.actualValue === undefined) codes.push('no_actual');
  // B4 (stage-10 rehearsal, item 4): a committer the record does not find customer-side is an ask of its own.
  if (p.targetValue !== null && p.targetValue !== undefined && p.people?.committer && p.people.committer.customer_side === false) codes.push('committer_not_customer_side');
  if (!p.people?.verifier) codes.push('no_verifier');
  const ours = new Set(['no_months', 'no_lens']);
  const unique = [...new Set(codes)];
  return {
    asks: unique.filter((c) => !ours.has(c)).map((c) => askFor(c, account, metric, unit)),
    vendorGaps: unique.filter((c) => ours.has(c)).map((c) => askFor(c, account, metric, unit)),
  };
}
