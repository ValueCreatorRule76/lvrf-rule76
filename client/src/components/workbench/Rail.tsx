import type { Run } from '../../types/run';

interface Stage {
  num: string;
  name: string;
  note: string;
}

// 01-07 numbering is not decoration: the spine is a sequence where order
// carries meaning (CLAUDE.md — this is the surface the Volume IV defect
// was missing). Stage notes use only what the payload actually carries —
// commit has no sponsor/date fields in this payload, so it gets none
// rather than an invented one.
function buildStages(run: Run): Stage[] {
  const p = run.payload;
  return [
    { num: '01', name: 'Baseline', note: `${p.baselineValue}` },
    { num: '02', name: 'Attach', note: p.capability },
    { num: '03', name: 'Model', note: `target ${p.targetValue}` },
    { num: '04', name: 'Commit', note: '' },
    { num: '05', name: 'Measure', note: `${p.actualValue}` },
    {
      num: '06',
      name: 'Verify',
      note: p.realization === 'verified' ? 'Verified' : 'Refused — gate held',
    },
    {
      num: '07',
      name: 'Return',
      note: p.realization === 'verified' ? 'Published' : 'Awaiting verification',
    },
  ];
}

function stageStatus(index: number, verified: boolean): 'done' | 'current' | 'blocked' {
  if (index <= 4) return 'done'; // baseline..measure always complete by the time a run exists
  if (index === 5) return verified ? 'done' : 'current'; // verify
  return verified ? 'done' : 'blocked'; // return
}

export function Rail({ run }: { run: Run }) {
  const verified = run.payload.realization === 'verified';
  const stages = buildStages(run);
  const h = run.payload.health;

  return (
    <nav
      aria-label="Value spine"
      className="sticky top-0 flex h-screen w-52 flex-none flex-col bg-ink py-5 text-offwhite"
    >
      <div className="px-4 pb-5">
        <img
          src="/assets/lvrf-mark.png"
          alt="LVRF — Learning Value Realization Framework"
          className="block h-auto w-full max-w-[172px]"
        />
        <p className="mt-[9px] text-[8.5px] uppercase tracking-[.2em] text-ink-45">
          Value Baseline Workbench
        </p>
      </div>

      <div className="px-[18px] pb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-25">
          Value Spine
        </span>
      </div>

      <ol className="flex-1 list-none m-0 p-0">
        {stages.map((stage, i) => {
          const status = stageStatus(i, verified);
          return (
            <li key={stage.num} className="relative">
              <a
                href="#"
                aria-current={status === 'current' ? 'step' : undefined}
                className={
                  'flex items-baseline gap-[11px] border-l-[3px] px-[18px] py-[9px] no-underline transition-colors ' +
                  (status === 'current'
                    ? 'border-l-gold bg-gold/[.14] text-offwhite'
                    : status === 'done'
                      ? 'border-l-transparent text-offwhite/70 hover:bg-white/[.04]'
                      : 'border-l-transparent text-offwhite/30 hover:bg-white/[.04]')
                }
              >
                <span
                  className={
                    'font-mono text-[10px] min-w-[15px] ' +
                    (status === 'done' || status === 'current' ? 'text-gold' : 'text-offwhite/25')
                  }
                >
                  {stage.num}
                </span>
                <span
                  className={
                    'font-display text-base tracking-[.07em] ' +
                    (status === 'blocked' ? 'line-through decoration-[1px]' : '')
                  }
                >
                  {stage.name}
                </span>
              </a>
              {stage.note && (
                <p
                  className={
                    'pl-11 pr-[18px] pb-[7px] pt-px text-[10.5px] ' +
                    (status === 'current'
                      ? 'text-gold not-italic'
                      : 'italic text-offwhite/40')
                  }
                >
                  {stage.note}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="border-t border-white/10 px-[18px] pt-4">
        <p className="m-0 mb-0.5 text-[10px] uppercase tracking-[.08em] text-offwhite/40">
          Institutional health
        </p>
        <p className="m-0 font-display text-[17px] tracking-[.05em] text-gold">
          {h.composite} · {h.band.toUpperCase()}
        </p>
        <p className="m-0 mt-[9px] mb-0.5 text-[10px] uppercase tracking-[.08em] text-offwhite/40">
          Coverage
        </p>
        <p className="m-0 font-display text-[17px] tracking-[.05em]">{h.coverage_pct}%</p>
      </div>
    </nav>
  );
}
