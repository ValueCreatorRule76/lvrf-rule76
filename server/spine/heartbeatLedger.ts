/**
 * The exact ten-heartbeat sequence one value-spine walk emits, and each
 * event's health_state — db/HEALTH_MODEL.md needs both to compute
 * institutional health. Pure: stages in, events out, no database.
 *
 * The one implementation: server/spine/walkSpine.ts drives its actual
 * emit() calls from this (via createPlanCursor), and
 * server/spine/verifyConfidenceParity.ts calls buildHeartbeatPlan() directly
 * for the health acceptance test. A second, hand-synchronised copy of this
 * sequence is exactly the shape of the ANY/EVERY divergence
 * db/CONFIDENCE_MODEL.md records: two implementations of one rule, drifting
 * silently, with a passing test in between.
 */
import type { HealthState } from './healthModel.js';

export interface HeartbeatPlanStep {
  heartbeatId: string;
  healthState: HealthState;
}

export interface HeartbeatPlanInput {
  baselineEvidenceCount: number;
  sponsorSynthetic: boolean;
  actualSimulated: boolean;
  realization: 'measured' | 'verified';
  disclosure: 'internal' | 'customer_shared';
}

export function buildHeartbeatPlan(input: HeartbeatPlanInput): HeartbeatPlanStep[] {
  const steps: HeartbeatPlanStep[] = [];
  steps.push({ heartbeatId: 'HB-0013', healthState: 'healthy' }); // baseline
  for (let i = 0; i < input.baselineEvidenceCount; i++) {
    steps.push({ heartbeatId: 'HB-0009', healthState: 'healthy' });
  }
  steps.push({ heartbeatId: 'HB-0004', healthState: 'healthy' }); // attach
  steps.push({ heartbeatId: 'HB-0005', healthState: 'healthy' }); // model
  steps.push({ heartbeatId: 'HB-0014', healthState: input.sponsorSynthetic ? 'watch' : 'healthy' }); // commit
  steps.push({ heartbeatId: 'HB-0018', healthState: 'healthy' }); // measure: assessment
  steps.push({ heartbeatId: 'HB-0015', healthState: input.actualSimulated ? 'watch' : 'healthy' }); // measure: actual
  steps.push({ heartbeatId: 'HB-0016', healthState: input.realization === 'verified' ? 'healthy' : 'warning' }); // verify
  steps.push({ heartbeatId: 'HB-0017', healthState: input.disclosure !== 'customer_shared' ? 'healthy' : 'watch' }); // return: record_documents
  steps.push({ heartbeatId: 'HB-0004', healthState: 'healthy' }); // return: stewardship_returns
  return steps;
}

/**
 * A sequential cursor over a plan, consumed one heartbeat at a time as the
 * walk emits. Throws on any mismatch between the plan and what's actually
 * being emitted — a loud crash in place of a silently wrong health score,
 * if the plan and the walk's stage order ever drift apart.
 */
export function createPlanCursor(plan: HeartbeatPlanStep[]) {
  let index = 0;
  return {
    next(expectedHeartbeatId: string): HealthState {
      const step = plan[index];
      if (!step || step.heartbeatId !== expectedHeartbeatId) {
        throw new Error(
          `Heartbeat plan/emit order mismatch at position ${index}: plan expected ` +
            `${step?.heartbeatId ?? 'nothing (plan exhausted)'}, walk is emitting ` +
            `${expectedHeartbeatId}. buildHeartbeatPlan() and the walk's stage order have drifted.`,
        );
      }
      index += 1;
      return step.healthState;
    },
  };
}
