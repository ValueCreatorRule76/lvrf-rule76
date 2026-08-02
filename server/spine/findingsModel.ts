/**
 * db/FINDINGS_MODEL.md — the last item from the port inventory, and not a
 * straight port. Findings live in value_runs.payload.findings only: no
 * table, no heartbeat. A finding is derived from a run, not an independent
 * object, and the run's payload is already a durable, hashed record.
 *
 * Two of the four findings carry rewritten messages, deliberately:
 *
 * F1's original message names 'financial' and six dimensions — the
 * pre-AMENDMENT-003 state. AMD-003 made the category->dimension mapping
 * total, so F1 cannot fire today; it survives only as a guard against a
 * future register amendment. Its message is now general, not describing a
 * state that no longer exists.
 *
 * F3's original message asserts both possible causes every time. Since the
 * ANY/EVERY gate change (db/CONFIDENCE_MODEL.md) those causes are
 * independent — the gate can refuse for either alone — so the message is
 * built from whichever condition(s) actually held, which is the entire
 * value of the finding when someone is trying to understand a refusal.
 */

import type { HealthState, UnmappedHealthEvent } from './healthModel.js';

export interface Finding {
  code: string;
  /** Same five-value vocabulary as health states. One vocabulary across the system. */
  severity: HealthState;
  message: string;
}

export interface FindingsInput {
  /** F1 — cannot fire today; AMENDMENT-003 made the mapping total. */
  unmappedEvents: UnmappedHealthEvent[];
  /** F2 */
  sponsorSynthetic: boolean;
  /** F3 — the two conditions the ANY/EVERY gate can independently refuse on. */
  anyActualEvidenceVerified: boolean;
  verifierSynthetic: boolean;
  /** F4 */
  confidenceBand: 'low' | 'medium' | 'high';
  confidenceScore: number;
}

export function computeFindings(input: FindingsInput): Finding[] {
  const findings: Finding[] = [];

  // F1 — grouped by category. Cannot occur today; HEARTBEAT-REGISTER §6 and
  // COMPASS-HEARTBEAT-STATUS §7 are total under AMENDMENT-003.
  const byCategory = new Map<string, number>();
  for (const e of input.unmappedEvents) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  }
  for (const [category, n] of byCategory) {
    findings.push({
      code: 'F1',
      severity: 'warning',
      message:
        `${n} event(s) in category '${category}' have no health dimension and were excluded ` +
        'from the composite. HEARTBEAT-REGISTER §6 and COMPASS-HEARTBEAT-STATUS §7 have ' +
        'diverged — a category exists with no dimension to receive it. Requires a Cathedral amendment.',
    });
  }

  // F2 — synthetic sponsor committed.
  if (input.sponsorSynthetic) {
    findings.push({
      code: 'F2',
      severity: 'watch',
      message:
        'HB-0014 committed by a synthetic sponsor. A real commitment requires a named customer ' +
        'sponsor; this event is simulated and the outcome may not be published externally.',
    });
  }

  // F3 — verification refused. The gate: canVerify = anyActualEvidenceVerified
  // && !verifierSynthetic. Message names only the condition(s) that actually
  // held, not both unconditionally.
  const canVerify = input.anyActualEvidenceVerified && !input.verifierSynthetic;
  if (!canVerify) {
    const reasons: string[] = [];
    if (!input.anyActualEvidenceVerified) reasons.push('no evidence supporting the actual has credit > 0');
    if (input.verifierSynthetic) reasons.push('the verifier of record is synthetic');
    const cause = reasons.length > 0 ? reasons.join(' and ') : 'no verifier of record';
    findings.push({
      code: 'F3',
      severity: 'warning',
      message:
        `Verification REFUSED — ${cause}. The outcome remains 'measured'. Schema CHECK ` +
        "'value_outcomes_verified_requires_human' would reject an attempt to force 'verified'.",
    });
  }

  // F4 — computed confidence LOW.
  if (input.confidenceBand === 'low') {
    findings.push({
      code: 'F4',
      severity: 'warning',
      message:
        `Computed confidence is ${input.confidenceScore.toFixed(1)}/100 (LOW). The record is not ` +
        'defensible to a finance function in this state. Confidence is derived from the evidence ' +
        'ledger and cannot be overridden by assertion.',
    });
  }

  return findings;
}
