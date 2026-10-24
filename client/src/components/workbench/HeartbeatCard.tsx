import type { Run } from '../../types/run';
import { Card, Badge } from './Card';
import { label, STAGE_LABEL } from '../../lib/labels';

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
      <Card title="Heartbeat ledger" badge={<Badge tone="watch">Unmeasured · 0 events</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          No heartbeat events are attached to this run. Nothing about its operational health has
          been established — this is not the same as healthy.
        </p>
      </Card>
    );
  }

  const allHealthy = events.every((e) => e.healthState === 'healthy');

  // UX-1 slice 4: stacked rows, not a table (standard 9); the heartbeat id and
  // the event's hash are an auditor's identifiers, so they sit in a mono line.
  return (
    <Card title="Heartbeat ledger" badge={<Badge tone="neutral">{events.length} events · {allHealthy ? 'all healthy' : 'see states'}</Badge>}>
      <ul className="m-0 list-none p-0" data-testid="heartbeat-ledger">
        {events.map((e, i) => (
          <li key={`${e.heartbeatId}-${i}`} className="border-b border-rule-soft py-2 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[12.5px] text-ink" data-record>{e.eventType}</span>
              <Badge tone={HEALTH_TONE[e.healthState] ?? 'neutral'}>{e.healthState.replace(/_/g, ' ')}</Badge>
            </div>
            <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">
              {e.category}
              {/*
                heartbeat_events.value_stage is nullable by design — a
                system-level event is not tied to any spine stage.
              */}
              {' · '}{e.valueStage === null ? 'no stage' : label(STAGE_LABEL, e.valueStage)}
            </p>
            <p className="m-0 mt-0.5 font-mono text-[10.5px] text-ink-45 [overflow-wrap:anywhere]">{e.heartbeatId} · {e.contentHash}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
