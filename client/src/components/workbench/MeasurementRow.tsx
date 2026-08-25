import { isEnrichedBusinessMetric, type Run } from '../../types/run';

// Unit/direction render when the payload carries them (walked after
// businessMetric was enriched) and degrade to bare numbers otherwise
// (older runs never had them and must not be back-filled). The <=4-char
// threshold for an inline number suffix mirrors records/render_record.py's
// own rule (`"" if len(bm['unit']) > 4 else bm['unit']`) — "%" reads fine
// stuck to a number, "incidents per 200,000 hours worked" does not, so it
// gets its own line instead, same as the PDF's "Unit / direction" row.
export function MeasurementRow({ run }: { run: Run }) {
  const p = run.payload;
  const d = p.delta;
  const bm = p.businessMetric;
  const enriched = isEnrichedBusinessMetric(bm);
  const inlineUnit = enriched && bm.unit.length <= 4 ? bm.unit : '';

  return (
    <div className="mb-[22px]">
      <div className="flex gap-px bg-rule">
        <div className="min-w-0 flex-1 bg-white px-4 pb-[15px] pt-3.5">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Baseline
          </span>
          <p className="m-0 font-display text-[34px] leading-[.88]">
            {p.baselineValue}
            <span className="font-body text-[15px] font-normal text-ink-45">{inlineUnit}</span>
          </p>
        </div>
        <div className="min-w-0 flex-1 bg-white px-4 pb-[15px] pt-3.5">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Target
          </span>
          {/*
            targetValue is null before commit — legitimately not-yet-set,
            not zero. Rendered at a smaller, italic, muted size rather than
            the display-size figure: a "0" or dash at that size would read
            as a stated target the model has no basis for.
          */}
          {p.targetValue === null ? (
            <p className="m-0 font-display text-[15px] italic leading-[1.4] text-ink-45">
              Not yet set
            </p>
          ) : (
            <p className="m-0 font-display text-[34px] leading-[.88]">
              {p.targetValue}
              <span className="font-body text-[15px] font-normal text-ink-45">{inlineUnit}</span>
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1 bg-white px-4 pb-[15px] pt-3.5">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Measured
          </span>
          {/* actualValue is null before measure — same treatment as Target above. */}
          {p.actualValue === null ? (
            <p className="m-0 font-display text-[15px] italic leading-[1.4] text-ink-45">
              Not yet measured
            </p>
          ) : (
            <p className="m-0 font-display text-[34px] leading-[.88]">
              {p.actualValue}
              <span className="font-body text-[15px] font-normal text-ink-45">{inlineUnit}</span>
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1 bg-ink px-4 pb-[15px] pt-3.5 text-offwhite">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.16em] text-gold">
            Delta
          </span>
          {/*
            d.available is false before measure — computeDelta
            (server/spine/deltaEngine.ts) returns no raw/pct_of_target at
            all when actualValue is null, not zeros. Same not-yet
            treatment as Target/Measured above, in this tile's own
            existing muted tone (text-offwhite/60, already used for the
            "% of target" line) rather than 0 or a dash, either of which
            would read as a computed delta the model never produced.
          */}
          {d.available ? (
            <>
              <p className="m-0 font-display text-[34px] leading-[.88]">
                {d.raw > 0 ? '+' : ''}
                {d.raw}
              </p>
              <p className="m-0 mt-[5px] text-[10.5px] text-offwhite/60">
                {d.pct_of_target}% of target · {p.realization}
                {enriched && ` · ${bm.direction} is better`}
              </p>
            </>
          ) : (
            <p className="m-0 font-display text-[15px] italic leading-[1.4] text-offwhite/60">
              Not yet measured
            </p>
          )}
        </div>
      </div>
      {enriched && (
        <p className="m-0 mt-2 text-[11px] text-ink-45">
          {bm.unit} · {bm.sourceSystem}
        </p>
      )}
    </div>
  );
}
