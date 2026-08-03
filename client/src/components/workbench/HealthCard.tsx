import type { Run } from '../../types/run';
import { Card, Badge } from './Card';

export function HealthCard({ run }: { run: Run }) {
  const h = run.payload.health;

  return (
    <Card
      n="03"
      title="Institutional health"
      badge={
        <Badge tone="watch">
          {h.composite} · {h.band} · {h.coverage_pct}% coverage
        </Badge>
      }
    >
      {h.dimensions.map((dim) => {
        const unmeasured = dim.state === 'UNMEASURED';
        return (
          <div key={dim.dimension} className="flex items-center gap-2.5 py-[7px] text-xs">
            <span
              className={
                'min-w-0 flex-1 ' + (unmeasured ? 'italic text-ink-45' : 'text-ink')
              }
            >
              {dim.dimension}
            </span>
            <span
              className={
                'h-[5px] w-[74px] flex-none bg-rule-soft ' +
                (unmeasured ? 'border border-dashed border-silver bg-transparent' : '')
              }
            >
              {!unmeasured && (
                <span
                  className="block h-full bg-ink"
                  style={{ width: `${dim.score}%` }}
                />
              )}
            </span>
            <span
              className={
                'min-w-[40px] flex-none text-right font-mono text-[11px] ' +
                (unmeasured ? 'italic text-ink-45' : '')
              }
            >
              {unmeasured ? '—' : dim.score}
            </span>
            <Badge tone="neutral">{dim.weight}%</Badge>
          </div>
        );
      })}

      {h.dimensions.some((d) => d.state === 'UNMEASURED') && (
        <div className="mt-3.5 border-l-[3px] border-gold bg-offwhite px-3.5 py-3">
          <h4 className="m-0 mb-1 font-display text-sm tracking-[.07em]">
            Unmeasured is not compliant
          </h4>
          <p className="m-0 text-[11.5px] text-ink-70">{h.basis}</p>
        </div>
      )}
    </Card>
  );
}
