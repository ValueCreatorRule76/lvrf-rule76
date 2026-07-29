import '../env.js';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { withActorTransaction, type Db } from '../db/withActorTransaction.js';
import * as schema from '../../db/schema.js';
import { loadFixture } from './fixture.js';
import { sha256Hex } from './hash.js';
import { seedCustomerZero, type SeedResult } from '../seed/seedCustomerZero.js';

/**
 * Walks all seven value-spine stages against the database, in TypeScript
 * rather than records/simulate_spine.py: this is the same logic the spine
 * will eventually run as API routes, and it exercises db/schema.ts for real
 * writes rather than only its DDL. records/*.py is untouched and stays the
 * document-rendering path.
 *
 * Ledger matches the Python simulator's heartbeat sequence exactly:
 *   HB-0013, HB-0009, HB-0004, HB-0005, HB-0014, HB-0018, HB-0015, HB-0016,
 *   HB-0017, HB-0004
 *
 * Not idempotent by design: each run is a new measurement cycle and creates
 * its own value_outcomes row (and evidence/assessment/document/return rows
 * beneath it), same as a real engagement would produce a new Realization
 * Record each period. Re-running this does not update the previous run's
 * outcome — it adds another one against the same (idempotent) engagement.
 */

const REQUIRED_HEARTBEATS = [
  'HB-0013', 'HB-0009', 'HB-0004', 'HB-0005', 'HB-0014',
  'HB-0018', 'HB-0015', 'HB-0016', 'HB-0017',
] as const;

type ValueStage = (typeof schema.valueStage.enumValues)[number];
type HealthState = (typeof schema.healthState.enumValues)[number];

interface HeartbeatRegisterRow {
  id: string;
  name: string;
  category: string;
  producer: string;
  failureSeverity: number;
}

async function loadHeartbeatRegister(db: Db): Promise<Map<string, HeartbeatRegisterRow>> {
  const rows = await db
    .select({
      id: schema.heartbeats.id,
      name: schema.heartbeats.name,
      category: schema.heartbeats.category,
      producer: schema.heartbeats.producer,
      failureSeverity: schema.heartbeats.failureSeverity,
    })
    .from(schema.heartbeats)
    .where(inArray(schema.heartbeats.id, [...REQUIRED_HEARTBEATS]));

  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of REQUIRED_HEARTBEATS) {
    if (!map.has(id)) {
      // Mirrors the FK on heartbeat_events.heartbeat_id: an unregistered
      // heartbeat is refused before it can be emitted, not after.
      throw new Error(
        `${id} is not in the heartbeat register. HEARTBEAT-REGISTER §1: an ` +
          'unregistered heartbeat is not constitutional. Amend the register ' +
          'through governance before emitting it.',
      );
    }
  }
  return map;
}

export interface EmittedHeartbeat {
  seq: number;
  heartbeatId: string;
  eventType: string;
  stage: ValueStage;
  subjectTable: string;
  subjectId: string;
  actorPersonId: string;
  healthState: HealthState;
  contentHash: string;
}

interface EmitContext {
  db: Db;
  register: Map<string, HeartbeatRegisterRow>;
  tenantId: string;
  institutionId: string;
  engagementId: string;
  contractVersion: string;
  constitutionalAuthority: string;
  events: EmittedHeartbeat[];
}

async function emit(
  ctx: EmitContext,
  heartbeatId: (typeof REQUIRED_HEARTBEATS)[number],
  opts: {
    stage: ValueStage;
    subjectTable: string;
    subjectId: string;
    actorPersonId: string;
    payload: Record<string, unknown>;
    healthState?: HealthState;
  },
): Promise<string> {
  const reg = ctx.register.get(heartbeatId);
  if (!reg) throw new Error(`${heartbeatId} is not in the heartbeat register.`);

  const healthState = opts.healthState ?? 'healthy';
  // §9: zero (informational) is legitimate data — only a non-healthy state
  // carries the register's failure severity.
  const severity = healthState === 'healthy' ? 0 : reg.failureSeverity;

  const body = {
    heartbeatId,
    eventType: reg.name,
    producer: reg.producer,
    valueStage: opts.stage,
    subjectTable: opts.subjectTable,
    subjectId: opts.subjectId,
    actorPersonId: opts.actorPersonId,
    payload: opts.payload,
  };
  const contentHash = sha256Hex(body); // §12: cryptographically hashed, tamper-evident

  await ctx.db.insert(schema.heartbeatEvents).values({
    heartbeatId,
    tenantId: ctx.tenantId,
    institutionId: ctx.institutionId,
    engagementId: ctx.engagementId,
    eventType: reg.name,
    producer: reg.producer,
    severity,
    healthState,
    constitutionalAuthority: ctx.constitutionalAuthority,
    contentHash,
    contractVersion: ctx.contractVersion,
    valueStage: opts.stage,
    subjectTable: opts.subjectTable,
    subjectId: opts.subjectId,
    actorPersonId: opts.actorPersonId,
    actorIsAgent: false,
    payload: opts.payload,
  });

  const event: EmittedHeartbeat = {
    seq: ctx.events.length + 1,
    heartbeatId,
    eventType: reg.name,
    stage: opts.stage,
    subjectTable: opts.subjectTable,
    subjectId: opts.subjectId,
    actorPersonId: opts.actorPersonId,
    healthState,
    contentHash,
  };
  ctx.events.push(event);
  return contentHash;
}

export interface VerifyGuardResult {
  code: string;
  constraint: string;
  message: string;
}

export interface WalkResult {
  seeded: SeedResult;
  valueOutcomeId: string;
  recordDocumentId: string;
  stewardshipReturnId: string;
  events: EmittedHeartbeat[];
  realization: string;
  disclosure: string;
  verifyGuard: VerifyGuardResult | null;
  rowsWritten: {
    evidence: number;
    value_outcomes: number;
    value_outcome_evidence: number;
    assessments: number;
    record_documents: number;
    stewardship_returns: number;
    heartbeat_events: number;
  };
}

export async function walkSpine(): Promise<WalkResult> {
  const fixture = await loadFixture();
  const seeded = await seedCustomerZero();

  const rowsWritten = {
    evidence: 0,
    value_outcomes: 0,
    value_outcome_evidence: 0,
    assessments: 0,
    record_documents: 0,
    stewardship_returns: 0,
    heartbeat_events: 0,
  };

  return withActorTransaction(pool, seeded.persons.valueEngineer.id, async (db, client: PoolClient) => {
    const register = await loadHeartbeatRegister(db);
    const ctx: EmitContext = {
      db,
      register,
      tenantId: seeded.tenant.id,
      institutionId: seeded.institution.id,
      engagementId: seeded.engagement.id,
      contractVersion: fixture.run.contract_version,
      constitutionalAuthority: fixture.run.constitutional_authority,
      events: [],
    };

    const vo = fixture.value_outcome;
    const bm = fixture.business_metric;
    const valueOutcomeId = randomUUID();

    // ---- STAGE 1: baseline --------------------------------------------------
    // establish the customer's current-state metric from their source system
    await emit(ctx, 'HB-0013', {
      stage: 'baseline',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.valueEngineer.id,
      payload: {
        metric: bm.name,
        sourceSystem: bm.source_system,
        baselineValue: vo.baseline_value,
        baselineMeasuredAt: vo.baseline_measured_at,
        sourced: vo.baseline_sourced,
      },
    });

    const baselineEvidenceIds: string[] = [];
    for (const ev of fixture.evidence.filter((e) => e.supports === 'baseline')) {
      const [row] = await db
        .insert(schema.evidence)
        .values({
          institutionId: seeded.institution.id,
          kind: ev.kind as (typeof schema.evidenceKind.enumValues)[number],
          summary: ev.summary,
          provenance: ev.provenance,
          sourceReference: ev.source_reference,
          confidence: ev.confidence,
          sourceVerified: ev.source_verified,
          capturedByPersonId: seeded.persons.valueEngineer.id,
        })
        .returning();
      rowsWritten.evidence += 1;
      baselineEvidenceIds.push(row.id);

      await emit(ctx, 'HB-0009', {
        stage: 'baseline',
        subjectTable: 'evidence',
        subjectId: row.id,
        actorPersonId: seeded.persons.valueEngineer.id,
        payload: { provenance: ev.provenance, sourceVerified: ev.source_verified },
      });
    }

    // ---- STAGE 2: attach -----------------------------------------------------
    // attach a capability to that metric — the hypothesis. The capability and
    // business metric were already seeded as static reference data; what gets
    // created here is the value_outcome itself — the canonical object that
    // records the attachment, carrying the id HB-0013 already referenced.
    const [valueOutcomeRow] = await db
      .insert(schema.valueOutcomes)
      .values({
        id: valueOutcomeId,
        engagementId: seeded.engagement.id,
        institutionId: seeded.institution.id,
        capabilityId: seeded.capability.id,
        businessMetricId: seeded.businessMetric.id,
        valueStage: 'attach',
        baselineValue: String(vo.baseline_value),
        baselineMeasuredAt: new Date(vo.baseline_measured_at),
        confidence: vo.confidence,
      })
      .returning();
    rowsWritten.value_outcomes += 1;

    for (const evidenceId of baselineEvidenceIds) {
      await db.insert(schema.valueOutcomeEvidence).values({
        valueOutcomeId,
        evidenceId,
        supports: 'baseline',
      });
      rowsWritten.value_outcome_evidence += 1;
    }

    await db.update(schema.engagements).set({ valueStage: 'attach' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0004', {
      stage: 'attach',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.valueEngineer.id,
      payload: {
        capability: fixture.capability.name,
        roleFamily: fixture.capability.role_family,
        attachedToMetric: bm.name,
      },
    });

    // ---- STAGE 3: model --------------------------------------------------------
    // model target and financial impact
    if (vo.currency_impact != null && !vo.impact_basis) {
      // Schema CHECK value_outcomes_impact_requires_basis would reject this
      // exact write. Fail before attempting it rather than relying on the
      // database to catch a known-bad payload.
      throw new Error('currency_impact requires impact_basis — refusing to attempt an UPDATE the schema would reject.');
    }
    await db
      .update(schema.valueOutcomes)
      .set({
        valueStage: 'model',
        targetValue: String(vo.target_value),
        currencyImpact: String(vo.currency_impact),
        currencyCode: vo.currency_code,
        impactBasis: vo.impact_basis,
      })
      .where(eq(schema.valueOutcomes.id, valueOutcomeId));

    await db.update(schema.engagements).set({ valueStage: 'model' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0005', {
      stage: 'model',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.valueEngineer.id,
      payload: {
        targetValue: vo.target_value,
        currencyImpact: vo.currency_impact,
        impactBasisStated: Boolean(vo.impact_basis),
      },
    });

    // ---- STAGE 4: commit ---------------------------------------------------------
    // the customer agrees the target is the right one
    await db
      .update(schema.valueOutcomes)
      .set({
        valueStage: 'commit',
        committedByPersonId: seeded.persons.sponsor.id,
        committedAt: new Date(),
      })
      .where(eq(schema.valueOutcomes.id, valueOutcomeId));

    await db.update(schema.engagements).set({ valueStage: 'commit' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0014', {
      stage: 'commit',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.sponsor.id,
      payload: {
        targetValue: vo.target_value,
        committedBy: fixture.persons.sponsor.name,
        synthetic: fixture.persons.sponsor.synthetic,
      },
      healthState: fixture.persons.sponsor.synthetic ? 'watch' : 'healthy',
    });

    // ---- STAGE 5: measure ---------------------------------------------------------
    // a measured actual arrives from the customer's system of record
    const a = fixture.assessment;
    const [assessmentRow] = await db
      .insert(schema.assessments)
      .values({
        institutionId: seeded.institution.id,
        // The fixture assesses a sales cohort, not a named individual, and
        // no cohort-representative person was in the requested seed list.
        // Mapped to the value engineer — the nearest existing real person —
        // rather than inventing an unrequested sixth person. Flagged in the
        // run report; redirect this if a different mapping is wanted.
        learnerPersonId: seeded.persons.valueEngineer.id,
        capabilityId: seeded.capability.id,
        score: String(a.score),
        scaleMin: String(a.scale_min),
        scaleMax: String(a.scale_max),
        assessedByPersonId: seeded.persons.coach.id,
        aiAssisted: a.ai_assisted,
        assessedAt: new Date(vo.actual_measured_at),
        learningStage: 'measure',
        notes: `Prior score ${a.prior_score} on a ${a.scale_min}-${a.scale_max} scale.`,
      })
      .returning();
    rowsWritten.assessments += 1;

    await emit(ctx, 'HB-0018', {
      stage: 'measure',
      subjectTable: 'assessments',
      subjectId: assessmentRow.id,
      actorPersonId: seeded.persons.coach.id,
      payload: {
        score: a.score,
        priorScore: a.prior_score,
        scaleMax: a.scale_max,
        aiAssisted: a.ai_assisted,
      },
    });

    const actualEvidence = fixture.evidence.filter((e) => e.supports === 'actual');
    for (const ev of actualEvidence) {
      const [row] = await db
        .insert(schema.evidence)
        .values({
          institutionId: seeded.institution.id,
          kind: ev.kind as (typeof schema.evidenceKind.enumValues)[number],
          summary: ev.summary,
          provenance: ev.provenance,
          sourceReference: ev.source_reference,
          confidence: ev.confidence,
          sourceVerified: ev.source_verified,
          assessmentId: ev.kind === 'assessment_result' ? assessmentRow.id : null,
          capturedByPersonId: ev.kind === 'assessment_result' ? seeded.persons.coach.id : seeded.persons.metricOwner.id,
        })
        .returning();
      rowsWritten.evidence += 1;

      await db.insert(schema.valueOutcomeEvidence).values({
        valueOutcomeId,
        evidenceId: row.id,
        supports: 'actual',
      });
      rowsWritten.value_outcome_evidence += 1;
    }

    // realization and actualValue must move in the same UPDATE — schema CHECK
    // value_outcomes_measured_requires_actual enforces exactly this ordering.
    await db
      .update(schema.valueOutcomes)
      .set({
        valueStage: 'measure',
        realization: 'measured',
        actualValue: String(vo.actual_value),
        actualMeasuredAt: new Date(vo.actual_measured_at),
      })
      .where(eq(schema.valueOutcomes.id, valueOutcomeId));

    await db.update(schema.engagements).set({ valueStage: 'measure' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0015', {
      stage: 'measure',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.metricOwner.id,
      payload: {
        actualValue: vo.actual_value,
        actualMeasuredAt: vo.actual_measured_at,
        simulated: vo.actual_simulated,
      },
      healthState: vo.actual_simulated ? 'watch' : 'healthy',
    });

    // ---- STAGE 6: verify -----------------------------------------------------------
    // a named human confirms sources and the delta — the disclosure gate
    const allActualEvidenceVerified = actualEvidence.length > 0 && actualEvidence.every((e) => e.source_verified);
    const verifierSynthetic = fixture.persons.verifier.synthetic;
    const canVerify = allActualEvidenceVerified && !verifierSynthetic;
    let verifyGuard: VerifyGuardResult | null = null;

    if (canVerify) {
      // Not exercised by this fixture — included for completeness of the
      // real verification path.
      await db
        .update(schema.valueOutcomes)
        .set({
          realization: 'verified',
          verifiedByPersonId: seeded.persons.verifier.id,
          verifiedAt: new Date(),
          sourceVerified: true,
        })
        .where(eq(schema.valueOutcomes.id, valueOutcomeId));
    } else {
      // Don't just assume the constraint would block an improper transition
      // — prove it. Attempt realization = 'verified' with no verifier of
      // record, inside a savepoint, expect Postgres to refuse it via
      // value_outcomes_verified_requires_human, then roll back to the
      // savepoint so the attempt leaves no trace on the row. If Postgres
      // does NOT refuse it, that is a real constitutional violation and this
      // throws rather than continuing.
      await client.query('SAVEPOINT verify_guard');
      try {
        await client.query(`UPDATE value_outcomes SET realization = 'verified' WHERE id = $1`, [valueOutcomeId]);
        throw new Error(
          'CONSTITUTIONAL VIOLATION: value_outcomes_verified_requires_human did not fire. ' +
            'realization advanced to verified with no human verifier of record. ' +
            'Stop and report this rather than adjusting the data.',
        );
      } catch (err) {
        const pgErr = err as { code?: string; constraint?: string; message: string };
        if (pgErr.code === '23514' && pgErr.constraint === 'value_outcomes_verified_requires_human') {
          await client.query('ROLLBACK TO SAVEPOINT verify_guard');
          verifyGuard = { code: pgErr.code, constraint: pgErr.constraint, message: pgErr.message };
        } else {
          throw err;
        }
      }
    }

    const realization = canVerify ? 'verified' : 'measured';

    await db.update(schema.valueOutcomes).set({ valueStage: 'verify' }).where(eq(schema.valueOutcomes.id, valueOutcomeId));
    await db.update(schema.engagements).set({ valueStage: 'verify' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0016', {
      stage: 'verify',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.verifier.id,
      payload: {
        realizationAdvancedTo: realization,
        allActualEvidenceVerified,
        verifierSynthetic,
      },
      healthState: realization === 'verified' ? 'healthy' : 'warning',
    });

    // ---- STAGE 7: return -------------------------------------------------------------
    // the finding returns to the portfolio and to Rule76
    const disclosure = realization === 'verified' ? 'customer_shared' : 'internal';
    const recordPayload = {
      engagement: fixture.engagement.name,
      capability: fixture.capability.name,
      businessMetric: bm.name,
      baselineValue: vo.baseline_value,
      targetValue: vo.target_value,
      actualValue: vo.actual_value,
      currencyImpact: vo.currency_impact,
      realization,
      disclosure,
    };
    const contentHash = sha256Hex(recordPayload);

    const [recordDocument] = await db
      .insert(schema.recordDocuments)
      .values({
        tenantId: seeded.tenant.id,
        engagementId: seeded.engagement.id,
        valueOutcomeId,
        documentVersion: 1,
        disclosure,
        contentHash,
        payload: recordPayload,
        renderedByPersonId: seeded.persons.valueEngineer.id,
      })
      .returning();
    rowsWritten.record_documents += 1;

    await emit(ctx, 'HB-0017', {
      stage: 'verify',
      subjectTable: 'record_documents',
      subjectId: recordDocument.id,
      actorPersonId: seeded.persons.valueEngineer.id,
      payload: { contentHash, disclosure, documentVersion: 1 },
      healthState: disclosure !== 'customer_shared' ? 'healthy' : 'watch',
    });

    const sr = fixture.stewardship_return;
    const [stewardshipReturn] = await db
      .insert(schema.stewardshipReturns)
      .values({
        tenantId: seeded.tenant.id,
        institutionId: seeded.institution.id,
        kind: sr.kind as (typeof schema.returnKind.enumValues)[number],
        summary: sr.summary,
        narrative: sr.narrative,
        capabilityId: seeded.capability.id,
        sourceValueOutcomeId: valueOutcomeId,
        targetChapel: sr.target_chapel,
      })
      .returning();
    rowsWritten.stewardship_returns += 1;

    await emit(ctx, 'HB-0004', {
      stage: 'return',
      subjectTable: 'stewardship_returns',
      subjectId: stewardshipReturn.id,
      actorPersonId: seeded.persons.valueEngineer.id,
      payload: { kind: sr.kind, summary: sr.summary, targetChapel: sr.target_chapel },
    });

    await db.update(schema.valueOutcomes).set({ valueStage: 'return' }).where(eq(schema.valueOutcomes.id, valueOutcomeId));
    await db.update(schema.engagements).set({ valueStage: 'return' }).where(eq(schema.engagements.id, seeded.engagement.id));

    rowsWritten.heartbeat_events = ctx.events.length;

    return {
      seeded,
      valueOutcomeId: valueOutcomeRow.id,
      recordDocumentId: recordDocument.id,
      stewardshipReturnId: stewardshipReturn.id,
      events: ctx.events,
      realization,
      disclosure,
      verifyGuard,
      rowsWritten,
    };
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  walkSpine()
    .then((result) => {
      console.log('Value spine walk complete — Customer Zero.\n');
      console.log(`value_outcome       ${result.valueOutcomeId}`);
      console.log(`record_document     ${result.recordDocumentId}`);
      console.log(`stewardship_return  ${result.stewardshipReturnId}\n`);

      console.log('Rows written');
      for (const [table, count] of Object.entries(result.rowsWritten)) {
        console.log(`  ${table.padEnd(22)} ${count}`);
      }

      console.log('\nHeartbeat ledger');
      console.log(`  ${'#'.padEnd(3)}${'HB'.padEnd(10)}${'STAGE'.padEnd(9)}${'STATE'.padEnd(10)}HASH`);
      for (const e of result.events) {
        console.log(
          `  ${String(e.seq).padEnd(3)}${e.heartbeatId.padEnd(10)}${e.stage.padEnd(9)}${e.healthState.padEnd(10)}${e.contentHash}`,
        );
      }

      console.log(`\nRealization         ${result.realization.toUpperCase()}`);
      console.log(`Disclosure          ${result.disclosure.toUpperCase()}`);

      if (result.verifyGuard) {
        console.log('\nVerify guard — confirmed blocking, not adjusted:');
        console.log(`  constraint: ${result.verifyGuard.constraint}`);
        console.log(`  message:    ${result.verifyGuard.message}`);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
