import type { ConfidenceFactorKey, Run } from '../../types/run';
import { ConfidenceBadge } from './Workspace';

// Fixed visual sequence, matching design/workbench.html's instrument and
// factor list — narrative order (what's known, then what's harder), not
// the payload's own array order. Reordering by an existing field (factor
// key) is a stable sort, not a computed value: no number here is anything
// other than what the payload already stored under that key.
const DISPLAY_ORDER: ConfidenceFactorKey[] = [
  'baseline_evidence_verified',
  'impact_basis_evidenced',
  'metric_definition_confirmed',
  'actual_evidence_verified',
  'human_commit_of_record',
  'human_verifier_of_record',
];

const FACTOR_LABEL: Record<ConfidenceFactorKey, string> = {
  baseline_evidence_verified: 'Baseline supported by source-verified evidence',
  impact_basis_evidenced: 'Impact basis stated and evidenced',
  metric_definition_confirmed: "Metric's calculation method known",
  actual_evidence_verified: 'Measured actual source-verified',
  // L2 (hygiene, 11 Oct 2026): was 'sponsor' — the factor reads
  // value_outcomes.committed_by_person_id, and its note says "Committed by".
  human_commit_of_record: 'Named human committer of record',
  human_verifier_of_record: 'Named human verifier of record',
};

/**
 * UX-1 slice 4: inline in the run page's folded ledgers (no longer a sticky
 * side panel). The score is written once, "n / 100 · Band" (standard 5), with
 * Low neutral; no "points outstanding" wording.
 */
export function ConfidenceInstrument({ run }: { run: Run }) {
  const c = run.payload.confidence;
  const factors = DISPLAY_ORDER.map((key) => c.factors.find((f) => f.factor === key)).filter(
    (f): f is NonNullable<typeof f> => f != null,
  );

  return (
    <section aria-label="How the score was made" className="mb-5 border border-rule bg-white px-4 py-4" data-testid="confidence-ledger">
      <h3 className="m-0 font-display text-[15px] tracking-[.07em]">How the score was made</h3>
      <p className="m-0 text-[11px] italic text-ink-45" data-testid="sealed-mark">Method and notes as recorded at sealing.</p>
      <p className="m-0 mt-2 flex flex-wrap items-baseline gap-2">
        <ConfidenceBadge score={c.score} band={c.band} />
        <span className="text-[11.5px] text-ink-45" data-record>{c.method}</span>
      </p>

      {/* the instrument: width = weight (already a share of 100, reused as
          the flex-basis directly), fill = earned/weight — the only ratio
          computed in this component, and the raw earned/weight numbers it
          visualizes are always printed in the factor list right below, so it
          can't silently disagree with them. */}
      <div className="mb-3 mt-3 flex h-[22px] gap-0.5" role="img" aria-label={`Confidence: ${factors.map((f) => `${f.earned} of ${f.weight} ${FACTOR_LABEL[f.factor]}`).join(', ')}`}>
        {factors.map((f) => {
          const full = f.earned === f.weight && f.earned > 0;
          const empty = f.earned === 0;
          const partialPct = f.weight > 0 ? (f.earned / f.weight) * 100 : 0;
          return (
            <div key={f.factor} className={'relative overflow-hidden ' + (empty ? 'border border-dashed border-silver bg-transparent' : 'bg-rule-soft')} style={{ flex: f.weight }}>
              {full && <span className="absolute inset-0 bg-ink" />}
              {!full && !empty && <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${partialPct}%` }} />}
            </div>
          );
        })}
      </div>

      <ul className="m-0 list-none p-0">
        {factors.map((f) => (
          <li key={f.factor} className="flex items-start gap-2.5 border-b border-rule-soft py-[9px] last:border-b-0">
            <span className={'min-w-[44px] flex-none pt-px text-right font-mono text-[11px] ' + (f.earned === f.weight ? 'font-semibold text-healthy' : 'text-ink-70')}>
              {f.earned} of {f.weight}
            </span>
            <span>
              <span className="text-xs leading-[1.4]">{FACTOR_LABEL[f.factor]}</span>
              <p className="m-0 mt-0.5 text-[11px] text-ink-45" data-record>{f.note}</p>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
