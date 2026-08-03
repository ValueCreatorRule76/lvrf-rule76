import type { ConfidenceFactorKey, Run } from '../../types/run';

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
  human_commit_of_record: 'Named human sponsor of record',
  human_verifier_of_record: 'Named human verifier of record',
};

export function ConfidenceInstrument({ run }: { run: Run }) {
  const c = run.payload.confidence;
  const factors = DISPLAY_ORDER.map((key) => c.factors.find((f) => f.factor === key)).filter(
    (f): f is NonNullable<typeof f> => f != null,
  );
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const outstanding = c.score != null ? 100 - c.score : null;

  return (
    <aside
      aria-label="Confidence ledger"
      className="sticky top-0 h-screen w-[336px] flex-none overflow-y-auto border-l border-rule bg-white px-[22px] pb-10 pt-[22px]"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
        Computed confidence
      </span>
      <div className="mb-4 border-b-[3px] border-ink pb-3">
        <div className="flex items-baseline gap-[9px]">
          <span className="font-display text-[66px] leading-[.88]">{c.score}</span>
          <span className="font-display text-[22px] text-ink-25">/100</span>
        </div>
        <p className="m-0 mt-0.5 font-display text-[17px] tracking-[.1em] text-critical">
          {c.band.toUpperCase()}
        </p>
        <p className="m-0 mt-[9px] text-[11px] italic text-ink-45">{c.method}</p>
      </div>

      {/* the instrument: width = weight (already a share of 100, reused as
          the flex-basis directly), fill = earned/weight — the only ratio
          computed in this component, and the raw earned/weight numbers it
          visualizes are always printed on the segment itself and in the
          factor list right below, so it can't silently disagree with them. */}
      <div className="mb-1 flex h-[46px] gap-0.5" role="img" aria-label={`Confidence: ${factors.map((f) => `${f.earned} of ${f.weight} ${FACTOR_LABEL[f.factor]}`).join(', ')}`}>
        {factors.map((f) => {
          const full = f.earned === f.weight && f.earned > 0;
          const empty = f.earned === 0;
          const partialPct = f.weight > 0 ? (f.earned / f.weight) * 100 : 0;
          return (
            <div
              key={f.factor}
              className={
                'relative overflow-hidden ' +
                (empty ? 'border border-dashed border-silver bg-transparent' : 'bg-rule-soft')
              }
              style={{ flex: f.weight }}
            >
              {full && <span className="absolute inset-0 bg-ink" />}
              {!full && !empty && (
                <span
                  className="absolute inset-y-0 left-0 bg-ink"
                  style={{ width: `${partialPct}%` }}
                />
              )}
              <span
                className={
                  'absolute inset-x-0 bottom-[3px] text-center font-mono text-[9px] ' +
                  (empty ? 'text-ink-25' : full ? 'text-offwhite' : 'text-ink')
                }
                // Partial segments straddle a black fill and a light
                // unfilled remainder — no single flat colour is legible
                // against both. A white halo keeps the dark label readable
                // over the black portion without hurting it over the light.
                style={!full && !empty ? { textShadow: '0 0 2px #FAFAFA, 0 0 2px #FAFAFA, 0 0 2px #FAFAFA' } : undefined}
              >
                {full ? f.weight : `${f.earned}/${f.weight}`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mb-5 flex justify-between text-[9.5px] uppercase tracking-[.06em] text-ink-45">
        <span>Earned {c.score}</span>
        <span>Outstanding {outstanding}</span>
      </p>

      <ul className="m-0 mb-5 list-none p-0">
        {factors.map((f) => (
          <li key={f.factor} className="flex items-start gap-2.5 border-b border-rule-soft py-[9px]">
            <span
              className={
                'flex-none min-w-[44px] pt-px text-right font-mono text-[11px] ' +
                (f.earned === f.weight ? 'font-semibold text-healthy' : f.earned === 0 ? 'text-ink-25' : '')
              }
            >
              {f.earned}/{f.weight}
            </span>
            <span>
              <span className="text-xs leading-[1.4]">{FACTOR_LABEL[f.factor]}</span>
              <p className="m-0 mt-0.5 text-[10.5px] text-ink-45">{f.note}</p>
            </span>
          </li>
        ))}
      </ul>

      <div className="border-l-[3px] border-gold bg-offwhite px-3.5 py-3">
        <h4 className="m-0 mb-1 font-display text-sm tracking-[.07em]">
          {outstanding && outstanding > 0
            ? `The missing ${outstanding} points are a work list`
            : 'Nothing outstanding on this ledger'}
        </h4>
        <p className="m-0 text-[11.5px] text-ink-70">
          Not a grade. Total weight across the six factors is {totalWeight}.
        </p>
      </div>
    </aside>
  );
}
