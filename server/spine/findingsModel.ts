/**
 * db/FINDINGS_MODEL.md — the last item from the port inventory, and not a
 * straight port. Findings live in value_runs.payload.findings only: no
 * table, no heartbeat. A finding is derived from a run, not an independent
 * object, and the run's payload is already a durable, hashed record.
 *
 * That position holds for F1-F4 (subject 'outcome') but stretches for
 * drift findings (subject 'instrument', codes D0, D1, D2, ...): those are
 * derived from the SYSTEM, not the outcome, and the run is merely where
 * they get reported. Two runs produced a minute apart would carry
 * identical drift findings about facts unrelated to either run. Do not
 * assume drift findings are outcome-derived just because they ride in the
 * same array — see Finding.subject below.
 *
 * Two of the four F-series findings carry rewritten messages, deliberately:
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
  /**
   * Who has to act. Not a naming convention — F1-D9 prefixes read the same
   * to a careless future author, and this codebase has already found six
   * conventions that were not constraints. 'outcome' findings are about the
   * measured engagement (F1-F4): a customer-facing condition an engagement
   * can close (F3 — "get a verifier"). 'instrument' findings are about the
   * governance machinery itself (D0-D9): a fact about the system that no
   * single engagement can close (D2 — "five triggers are declared and not
   * applied" is not a customer's problem). Same card, different addressee;
   * the reader must be able to tell which without parsing the code.
   */
  subject: 'outcome' | 'instrument';
}

export interface FindingsInput {
  /** F1 — cannot fire today; AMENDMENT-003 made the mapping total. */
  unmappedEvents: UnmappedHealthEvent[];
  /** F2 */
  committerSynthetic: boolean;
  /** F3 — the two conditions the ANY/EVERY gate can independently refuse on. */
  anyActualEvidenceVerified: boolean;
  verifierSynthetic: boolean;
  /** F4 */
  confidenceBand: 'low' | 'medium' | 'high';
  confidenceScore: number;
  /**
   * Whether the drift instrument's own self-checks ran for this record.
   * Required, not optional: a drift check that passes produces nothing, so
   * an empty driftFindings array is ambiguous between "ran clean" and
   * "never ran" — exactly the ambiguity this system refuses everywhere
   * else (absence of evidence is not evidence of absence). An optional
   * field defaulting to true would silently assert "checks ran" on every
   * caller that hasn't been updated yet; that plausible default is the
   * failure. Making it required instead forces every caller to say which
   * fact it has, and breaks the build for any caller that hasn't decided.
   */
  driftChecksRan: boolean;
  /**
   * Drift findings, already fully formed (code, severity, message,
   * subject: 'instrument') by the caller. computeFindings decides nothing
   * about their content and does not query anything to produce them — it
   * only decides whether D0 also belongs alongside them. That keeps this
   * function pure: verifyConfidenceParity.ts calls it directly with
   * fixture data, and a model that queried a database would break that.
   */
  driftFindings: Finding[];
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
      subject: 'outcome',
      message:
        `${n} event(s) in category '${category}' have no health dimension and were excluded ` +
        'from the composite. HEARTBEAT-REGISTER §6 and COMPASS-HEARTBEAT-STATUS §7 have ' +
        'diverged — a category exists with no dimension to receive it. Requires a Cathedral amendment.',
    });
  }

  // F2 — synthetic committer.
  if (input.committerSynthetic) {
    findings.push({
      code: 'F2',
      severity: 'watch',
      subject: 'outcome',
      message:
        'HB-0014 committed by a synthetic committer. A real commitment requires a named, ' +
        'non-simulated person at the account who committed to this target; this event is ' +
        'simulated and the outcome may not be published externally.',
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
      subject: 'outcome',
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
      subject: 'outcome',
      message:
        `Computed confidence is ${input.confidenceScore.toFixed(1)}/100 (LOW). The record is not ` +
        'defensible to a finance function in this state. Confidence is derived from the evidence ' +
        'ledger and cannot be overridden by assertion.',
    });
  }

  // D0 — the drift instrument's self-checks did not run for this record.
  // Severity is 'warning', never 'watch': 'watch' means keep an eye on
  // this, but a false statement about the record's own governance is not
  // something to watch, it is wrong, and wrong needs treating. A clean
  // driftFindings array is ambiguous between "checked, found nothing" and
  // "never checked" — this finding is what removes that ambiguity when
  // the latter is true, so the record states which one it has rather than
  // letting a reader assume the record's governance was verified.
  if (!input.driftChecksRan) {
    findings.push({
      code: 'D0',
      severity: 'warning',
      subject: 'instrument',
      message:
        "The drift instrument's self-checks did not run for this record. This record cannot " +
        'claim its own governance was verified.',
    });
  }

  // Drift findings (D1, D2, ...) arrive already fully formed by the
  // caller — computeFindings decides nothing about their content, only
  // whether D0 belongs alongside them.
  findings.push(...input.driftFindings);

  return findings;
}
