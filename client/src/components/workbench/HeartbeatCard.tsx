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

  if (events.length === 0) {
    // Zero events is not the same claim as "all healthy" — nothing about
    // this run's operational health has been established at all. Same
    // defect class HealthCard already guards against with its own
    // UNMEASURED badge; match it rather than let an empty table read as a
    // clean bill of health.
    return (
      <Card n="02" title="Heartbeat ledger" badge={<Badge tone="watch">UNMEASURED · 0 events</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          No heartbeat events are attached to this run. Nothing about its operational health has
          been established — this is not the same as healthy.
        </p>
      </Card>
    );
  }

  const allHealthy = events.every((e) => e.healthState === 'healthy');
  // Runtime emitters never set value_stage — a lock is not a spine stage —
  // so a run built entirely from runtime events would show "No stage" down
  // every row: a column with width and no information. Shown only when at
  // least one event in the set actually carries a stage (a fixture-walk
  // run, or a run mixing both kinds of event); the per-row fallback below
  // still applies to whichever rows in that set have none.
  const hasAnyStage = events.some((e) => e.valueStage !== null);
  const headers = hasAnyStage
    ? ['ID', 'Event', 'Stage', 'Category', 'State', 'Hash']
    : ['ID', 'Event', 'Category', 'State', 'Hash'];

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
            {headers.map((h) => (
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
              {hasAnyStage && (
                <td className="border-b border-rule-soft px-3 py-[9px] text-[11.5px] text-ink-45">
                  {/*
                    heartbeat_events.value_stage is nullable by design — a
                    system-level event (HB-0001 system init, HB-0002
                    authentication) is not tied to any spine stage. A blank
                    cell would be indistinguishable from not-applicable.
                  */}
                  {e.valueStage === null ? <span className="italic">No stage</span> : e.valueStage}
                </td>
              )}
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
