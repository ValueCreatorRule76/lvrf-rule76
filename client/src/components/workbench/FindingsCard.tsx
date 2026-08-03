import type { Run } from '../../types/run';
import { Card, Badge } from './Card';

const SEVERITY_TONE: Record<string, 'healthy' | 'watch' | 'warning' | 'critical' | 'failure'> = {
  watch: 'watch',
  warning: 'warning',
  critical: 'critical',
  constitutional_failure: 'failure',
};

export function FindingsCard({ run }: { run: Run }) {
  const findings = run.payload.findings;

  return (
    <Card n="04" title="Findings" badge={<Badge tone="neutral">{findings.length}</Badge>}>
      {findings.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">None raised for this run.</p>
      ) : (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {['Code', 'Severity', 'Finding'].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-silver px-3 py-[9px] text-left text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.code}>
                <td className="border-b border-rule-soft px-3 py-[9px] font-mono font-semibold">
                  {f.code}
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">
                  <Badge tone={SEVERITY_TONE[f.severity] ?? 'neutral'}>{f.severity}</Badge>
                </td>
                <td className="border-b border-rule-soft px-3 py-[9px]">{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
