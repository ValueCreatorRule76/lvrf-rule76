import type { PoolClient } from 'pg';
import * as schema from '../../db/schema.js';
import { sha256Hex } from './hash.js';
import type { HealthState } from './healthModel.js';

/**
 * A single heartbeat event, written by a live route handler — not a walk.
 *
 * THE BOUNDARY: heartbeatLedger.ts's buildHeartbeatPlan is deliberately the
 * SINGLE implementation of the ten-event value-spine walk sequence. Its own
 * comment: "A second, hand-synchronised copy of this sequence is exactly the
 * shape of the ANY/EVERY divergence db/CONFIDENCE_MODEL.md records: two
 * implementations of one rule, drifting silently, with a passing test in
 * between."
 *
 * This function is PER-EVENT, not a sequence. It emits one event because a
 * caller says one thing happened; it has no notion of what came before or
 * what should come next, and it must never gain one. It does not import
 * from, call, or duplicate anything in heartbeatLedger.ts or walkSpine.ts. If
 * a future change makes this function aware of order — a "what heartbeat
 * comes after this one" table, a plan, a cursor — that change IS the
 * divergence the warning above describes, however it's built.
 */
export interface EmitHeartbeatOptions {
  heartbeatId: string;
  tenantId: string;
  institutionId?: string;
  engagementId?: string;
  valueRunId?: string;
  valueStage?: (typeof schema.valueStage.enumValues)[number];
  learningStage?: (typeof schema.learningStage.enumValues)[number];
  subjectTable: string;
  subjectId: string;
  actorPersonId: string;
  healthState: HealthState;
  /** Overrides the register's failure_severity. Only when the caller has a specific reason to name a different number than the register's own — see the register-read note below. */
  severity?: number;
  payload?: Record<string, unknown>;
}

/**
 * Writes one row to heartbeat_events, in the caller's own transaction.
 *
 * `client` MUST be the caller's transaction client (req.dbClient), never the
 * pool. The event has to land in the SAME transaction as the thing it
 * records — a heartbeat for a write that then rolls back would be a
 * heartbeat for something that never happened, which is a lie the register
 * cannot tell.
 *
 * event_type, producer and constitutional_authority are read from the
 * heartbeats row named by heartbeatId, never passed by the caller. A
 * constant duplicated at a call site is the #C8A24A failure again — one
 * value, defined twice, free to drift. walkSpine.ts reads producer and
 * severity from the register for this same reason; contract_version and
 * constitutional_authority came from a fixture there, which this runtime
 * emitter has no equivalent of, so constitutional_authority is read from the
 * register here instead and contract_version is left to its column default
 * (`'1.0.0'`) — not passed at all, so a future default change needs no
 * corresponding edit here.
 */
export async function emitHeartbeat(client: PoolClient, opts: EmitHeartbeatOptions): Promise<string> {
  const { rows: [reg] } = await client.query<{
    name: string;
    producer: string;
    failure_severity: number;
    constitutional_authority: string;
  }>(
    'SELECT name, producer, failure_severity, constitutional_authority FROM heartbeats WHERE id = $1',
    [opts.heartbeatId],
  );
  // Mirrors the FK on heartbeat_events.heartbeat_id: an unregistered
  // heartbeat is refused before it can be emitted, not after. A heartbeat
  // for an unregistered id is not a heartbeat — this is a genuine fault, not
  // caller input to validate, so it throws rather than returning a result
  // the caller would have to remember to check.
  if (!reg) {
    throw new Error(
      `${opts.heartbeatId} is not in the heartbeat register. HEARTBEAT-REGISTER §1: an ` +
        'unregistered heartbeat is not constitutional. Amend the register through ' +
        'governance before emitting it.',
    );
  }

  // §9: zero (informational) is legitimate data — only a non-healthy state
  // carries the register's failure severity. Same rule walkSpine.ts's
  // emit() applies. opts.severity overrides it only when the caller has a
  // specific reason to name a different number than this default.
  const defaultSeverity = opts.healthState === 'healthy' ? 0 : reg.failure_severity;
  const severity = opts.severity ?? defaultSeverity;

  const payload = opts.payload ?? {};

  // The same field set walkSpine.ts's emit() hashes, in the same shape — a
  // hash computed over a different set of fields is not comparable. This
  // deliberately does NOT include opts's scoping fields (tenantId,
  // institutionId, engagementId, valueRunId, learningStage): those are
  // stored as plain columns below, exactly as they are in walkSpine's own
  // insert, and were never part of its hashed body either.
  const body = {
    heartbeatId: opts.heartbeatId,
    eventType: reg.name,
    producer: reg.producer,
    valueStage: opts.valueStage ?? null,
    subjectTable: opts.subjectTable,
    subjectId: opts.subjectId,
    actorPersonId: opts.actorPersonId,
    payload,
  };
  const contentHash = sha256Hex(body); // §12: cryptographically hashed, tamper-evident

  const { rows: [inserted] } = await client.query<{ content_hash: string }>(
    `INSERT INTO heartbeat_events (
       heartbeat_id, tenant_id, institution_id, engagement_id, value_run_id,
       event_type, producer, severity, health_state, constitutional_authority,
       content_hash, value_stage, learning_stage, subject_table, subject_id,
       actor_person_id, actor_is_agent, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING content_hash`,
    [
      opts.heartbeatId, opts.tenantId, opts.institutionId ?? null, opts.engagementId ?? null, opts.valueRunId ?? null,
      reg.name, reg.producer, severity, opts.healthState, reg.constitutional_authority,
      contentHash, opts.valueStage ?? null, opts.learningStage ?? null, opts.subjectTable, opts.subjectId,
      opts.actorPersonId, false, payload,
    ],
  );

  return inserted.content_hash;
}
