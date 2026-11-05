/**
 * B3 (LVRF_PLAN §19, added 5 Nov 2026; a CVAF pattern) — what the value case asks for, and the one converting question
 * the account executive asks to clear each refusal. One entry per reason code; the case renders the account and metric
 * into {account} and {metric}. Every code the CFO page or lvrf_cost_of_delay() can give must be here:
 * verify_value_case.sh fails a code with no entry.
 *
 *   need:     what we need from you, as the refusal page says it
 *   question: the converting question
 */
export interface CaseAsk { need: string; question: string }

export const CASE_ASKS: Record<string, CaseAsk> = {
  // The CFO lens (O3, O-D1, O-D3).
  no_lens: {
    need: 'A CFO lens ratified by the vendor’s steward.',
    question: 'This is ours to fix before the review: no CFO lens has been ratified yet.',
  },
  reference_example: {
    need: 'An account’s own engagement. A reference example is never read through the CFO lens.',
    question: 'Would {account} take part as an engagement, so the case rests on its own records?',
  },
  below_threshold: {
    need: 'Enough customer-side evidence to reach the lens’s minimum computed confidence.',
    question: 'Which of the asks in this case can {account} supply first?',
  },
  no_actual: {
    need: 'A measured result for {metric} from {account}’s system of record.',
    question: 'Who owns {metric} at {account}, and could they share the figure from the system that records it?',
  },
  actual_basis_not_admitted: {
    need: 'The measured result from a system of record or a published source.',
    question: 'Can the result come from the system that records {metric}, rather than an estimate?',
  },
  baseline_not_system_of_record: {
    need: 'A baseline for {metric} from {account}’s system of record.',
    question: 'What did {metric} read over the last full period, from the system that records it?',
  },
  no_verifier: {
    need: 'A named person at {account} to verify the measured result.',
    question: 'Who at {account} would confirm the result against their own records?',
  },
  // Cost of delay (lvrf_cost_of_delay, design §5.4).
  no_months: {
    need: 'The cost-of-delay months, set by the vendor’s steward.',
    question: 'This is ours to fix before the review: the cost-of-delay months are not set.',
  },
  no_commitment: {
    need: 'A target for {metric}, committed to by a named person at {account}.',
    question: 'Who at {account} would commit to a target for {metric}, and by when?',
  },
  target_not_improvement: {
    need: 'A committed target that improves {metric} in its direction.',
    question: 'Is the committed target for {metric} meant to be an improvement on the baseline?',
  },
  no_rate: {
    need: 'What one unit of {metric} is worth to {account} per year, stated by {account}.',
    question: 'What is one unit of {metric} worth to {account} each year, and who in finance would stand behind that figure?',
  },
  rate_basis: {
    need: 'The rate stated by {account}, or taken from its own records.',
    question: 'Can {account}’s finance team state the rate, or point to the record it comes from?',
  },
  rate_not_attested: {
    need: 'The rate attested by a named person at {account}.',
    question: 'Who in {account}’s finance team would attest the rate in writing?',
  },
  rate_unit: {
    need: 'The rate stated per unit of {metric}, in the unit {metric} is measured in.',
    question: 'Can the rate be restated per unit of {metric} as {account} measures it?',
  },
  no_measure_class: {
    need: 'The kind of value {metric} is (performance, or compliance and risk), stated at commitment.',
    question: 'When the target is committed, is {metric} about performance, or about compliance and risk?',
  },
};

export function askFor(code: string, account: string, metric: string): CaseAsk & { code: string } {
  const a = CASE_ASKS[code];
  if (!a) throw new Error(`LVRF: the value case has no ask for reason "${code}"`);
  const fill = (t: string) => t.replaceAll('{account}', account).replaceAll('{metric}', metric);
  return { code, need: fill(a.need), question: fill(a.question) };
}
