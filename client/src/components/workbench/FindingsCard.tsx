import type { Run } from '../../types/run';
import { Card, Badge } from './Card';

const SEVERITY_TONE: Record<string, 'healthy' | 'watch' | 'warning' | 'critical' | 'failure'> = {
  watch: 'watch',
  warning: 'warning',
  critical: 'critical',
  constitutional_failure: 'failure',
};

// UX-1 slice 4: stacked rows, not a table. The code is an auditor's
// identifier (mono); the message is the record's own words, as sealed.
export function FindingsCard({ run }: { run: Run }) {
  const findings = run.payload.findings;

  return (
    <Card title="Findings" badge={<Badge tone="neutral">{findings.length}</Badge>}>
      {findings.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">None raised for this run.</p>
      ) : (
        <>
        <p className="m-0 text-[11px] italic text-ink-45" data-testid="sealed-mark">Messages as recorded at sealing.</p>
        <ul className="m-0 list-none p-0" data-testid="findings">
          {findings.map((f) => (
            <li key={f.code} className="border-b border-rule-soft py-2 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge tone={SEVERITY_TONE[f.severity] ?? 'neutral'}>{f.severity.replace(/_/g, ' ')}</Badge>
                <span className="font-mono text-[10.5px] text-ink-45">{f.code}</span>
              </div>
              <p className="m-0 mt-1 text-[12.5px] text-ink" data-record>{f.message}</p>
            </li>
          ))}
        </ul>
        </>
      )}
    </Card>
  );
}
