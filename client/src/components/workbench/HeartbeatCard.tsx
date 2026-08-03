import type { Run } from '../../types/run';
import { Card, Badge } from './Card';

const HEALTH_TONE: Record<string, 'healthy' | 'watch' | 'warning' | 'critical' | 'failure'> = {
  healthy: 'healthy',
  watch: 'watch',
  warning: 'warning',
  critical: 'critical',
  constitutional_failure: 'failure',
};

export function HeartbeatCard({ run }: { run: Run }) {
  const events = run.payload.events;
  const allHealthy = events.every((e) => e.healthState === 'healthy');

  return (
    <Card
      n="02"
      title="Heartbeat ledger"
      badge={
        <Badge tone="neutral">
          {events.length} events · {allHealthy ? 'all healthy' : 'see states'}
        </Badge>
      }
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {['ID', 'Event', 'Stage', 'Category', 'State', 'Hash'].map((h) => (
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
          {events.map((e, i) => (
            <tr key={`${e.heartbeatId}-${i}`}>
              <td className="border-b border-rule-soft px-3 py-[9px] font-mono font-semibold">
                {e.heartbeatId}
              </td>
              <td className="border-b border-rule-soft px-3 py-[9px]">{e.eventType}</td>
              <td className="border-b border-rule-soft px-3 py-[9px] text-[11.5px] text-ink-45">
                {e.valueStage}
              </td>
              <td className="border-b border-rule-soft px-3 py-[9px] text-[11.5px] text-ink-45">
                {e.category}
              </td>
              <td className="border-b border-rule-soft px-3 py-[9px]">
                <Badge tone={HEALTH_TONE[e.healthState] ?? 'neutral'}>{e.healthState}</Badge>
              </td>
              <td className="whitespace-nowrap border-b border-rule-soft px-3 py-[9px] font-mono">
                {e.contentHash.slice(0, 12)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
