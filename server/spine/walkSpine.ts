import '../env.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { eq, inArray, sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { withActorTransaction, type Db } from '../db/withActorTransaction.js';
import * as schema from '../../db/schema.js';
import { loadFixture } from './fixture.js';
import { sha256Hex } from './hash.js';
import { seedCustomerZero, type SeedResult } from '../seed/seedCustomerZero.js';
import { computeConfidence, evidenceCredit, fixtureEvidenceToInput, type ConfidenceResult } from './confidenceModel.js';
import { computeDelta, type DeltaResult } from './deltaEngine.js';
import { computeHealth, type HealthResult } from './healthModel.js';
import { computeFindings, type Finding } from './findingsModel.js';
import { buildHeartbeatPlan, createPlanCursor } from './heartbeatLedger.js';

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

export interface WalkOptions {
  /**
   * Raise partway through the walk, after the named stage's heartbeats are
   * emitted, to prove the walk is atomic: a failed run must leave zero
   * heartbeat_events. Development/test only — never honoured outside it, so
   * this cannot become a way to abort a real walk in production.
   */
  failAt?: ValueStage;
  /** records/*.json filename to walk. Defaults to customer_zero.json. */
  fixtureFile?: string;
}

function maybeFail(opts: WalkOptions | undefined, stage: ValueStage): void {
  if (process.env.NODE_ENV !== 'production' && opts?.failAt === stage) {
    throw new Error(`--fail-at=${stage}: deliberate failure for atomicity testing. No row from this walk should persist.`);
  }
}

interface HeartbeatRegisterRow {
  id: string;
  name: string;
  category: string;
  producer: string;
  failureSeverity: number;
  /** db/HEALTH_MODEL.md's within-dimension weight. Not selecting this makes the health model wrong, not absent. */
  healthWeight: number;
}

async function loadHeartbeatRegister(db: Db): Promise<Map<string, HeartbeatRegisterRow>> {
  const rows = await db
    .select({
      id: schema.heartbeats.id,
      name: schema.heartbeats.name,
      category: schema.heartbeats.category,
      producer: schema.heartbeats.producer,
      failureSeverity: schema.heartbeats.failureSeverity,
      healthWeight: schema.heartbeats.healthWeight,
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
  /** db/HEALTH_MODEL.md — dimension and within-dimension weight, from the register. */
  category: string;
  healthWeight: number;
  /** records/render_record.py's heartbeat ledger table reads this from the register too. */
  producer: string;
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
  /** 0003. Stamped on every event so a walk's ledger is attributable to the run. */
  valueRunId: string;
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
    valueRunId: ctx.valueRunId,
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
    category: reg.category,
    healthWeight: reg.healthWeight,
    producer: reg.producer,
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
  valueRunId: string;
  runNumber: number;
  sourceFixture: string;
  payloadHash: string;
  /** Exactly the object payload_hash was computed over, plus payloadHash itself. */
  runPayload: Record<string, unknown>;
  valueOutcomeId: string;
  recordDocumentId: string;
  stewardshipReturnId: string;
  events: EmittedHeartbeat[];
  realization: string;
  disclosure: string;
  confidence: ConfidenceResult;
  delta: DeltaResult;
  health: HealthResult;
  findings: Finding[];
  verifyGuard: VerifyGuardResult | null;
  rowsWritten: {
    evidence: number;
    value_outcomes: number;
    value_outcome_evidence: number;
    assessments: number;
    record_documents: number;
    stewardship_returns: number;
    heartbeat_events: number;
    value_runs: number;
  };
}

export async function walkSpine(opts?: WalkOptions): Promise<WalkResult> {
  const fixtureFile = opts?.fixtureFile ?? 'customer_zero.json';
  // Stem only, no extension — e.g. 'customer_b'. Stamped on the run so a
  // mismatch between a run and the fixture it's rendered against can be
  // caught, the way render_record.py's guard used to before the run's
  // provenance stopped being recorded anywhere. db/DELTA_AND_PROVENANCE.md.
  const sourceFixture = basename(fixtureFile, extname(fixtureFile));
  const fixture = await loadFixture(fixtureFile);
  const seeded = await seedCustomerZero(fixtureFile);

  const rowsWritten = {
    evidence: 0,
    value_outcomes: 0,
    value_outcome_evidence: 0,
    assessments: 0,
    record_documents: 0,
    stewardship_returns: 0,
    heartbeat_events: 0,
    value_runs: 0,
  };

  const result = await withActorTransaction(pool, seeded.persons.valueEngineer.id, async (db, client: PoolClient) => {
    const register = await loadHeartbeatRegister(db);
    // 0003: identity generated before the walk; the row is still written last.
    const valueRunId = randomUUID();
    const ctx: EmitContext = {
      db,
      register,
      tenantId: seeded.tenant.id,
      institutionId: seeded.institution.id,
      engagementId: seeded.engagement.id,
      contractVersion: fixture.run.contract_version,
      constitutionalAuthority: fixture.run.constitutional_authority,
      events: [],
      valueRunId,
    };

    const vo = fixture.value_outcome;
    const bm = fixture.business_metric;
    const valueOutcomeId = randomUUID();

    // Hoisted from STAGE 6: this is pure (fixture data plus confidenceModel's
    // shared evidenceCredit gate — no DB reads), so it's knowable before the
    // walk begins. STAGE 6 still performs the actual conditional UPDATE and
    // savepoint verification below; only the prediction of what it will find
    // moved earlier, so the full heartbeat plan can be built once, up front,
    // and drive every emit() call rather than being reconstructed by a second
    // implementation for the health model.
    //
    // ANY, not EVERY: db/CONFIDENCE_MODEL.md's verification-gate section. The
    // gate asks whether the source was confirmed by an authority over it, not
    // how strong that confirmation is — one item clearing (independently
    // verified, or attested by a named, institution-scoped, non-synthetic
    // authority) is enough. Requiring every item would mean a weak
    // corroborating source (e.g. an unverified control-room observation)
    // downgrades an otherwise-cleared record, which teaches value engineers to
    // omit corroborating sources. Confidence separately grades on MAX credit;
    // the record still discloses ALL evidence, verified or not.
    const actualEvidence = fixture.evidence.filter((e) => e.supports === 'actual');
    const anyActualEvidenceVerified =
      actualEvidence.length > 0 &&
      actualEvidence.some((e) => evidenceCredit(fixtureEvidenceToInput(fixture, e)).credit > 0);
    const verifierSynthetic = fixture.persons.verifier.synthetic;
    const canVerify = anyActualEvidenceVerified && !verifierSynthetic;
    const realization = canVerify ? 'verified' : 'measured';
    const disclosure = realization === 'verified' ? 'customer_shared' : 'internal';

    // db/HEALTH_MODEL.md — one plan, consumed in order as the walk emits.
    // server/spine/verifyConfidenceParity.ts calls buildHeartbeatPlan()
    // directly with the same inputs to check the health acceptance values,
    // rather than re-deriving this sequence by hand.
    const heartbeatPlan = buildHeartbeatPlan({
      baselineEvidenceCount: fixture.evidence.filter((e) => e.supports === 'baseline').length,
      sponsorSynthetic: fixture.persons.sponsor.synthetic,
      actualSimulated: vo.actual_simulated,
      realization,
      disclosure,
    });
    const planCursor = createPlanCursor(heartbeatPlan);

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
      healthState: planCursor.next('HB-0013'),
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
        healthState: planCursor.next('HB-0009'),
      });
    }

    maybeFail(opts, 'baseline');

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
      healthState: planCursor.next('HB-0004'),
    });

    maybeFail(opts, 'attach');

    // ---- STAGE 3: model --------------------------------------------------------
    // model target and financial impact
    if (vo.claimed_currency_impact != null && !vo.impact_basis) {
      // Schema CHECK value_outcomes_impact_requires_basis would reject this
      // exact write. Fail before attempting it rather than relying on the
      // database to catch a known-bad payload.
      throw new Error('claimed_currency_impact requires impact_basis — refusing to attempt an UPDATE the schema would reject.');
    }
    await db
      .update(schema.valueOutcomes)
      .set({
        valueStage: 'model',
        targetValue: String(vo.target_value),
        claimedCurrencyImpact: vo.claimed_currency_impact != null ? String(vo.claimed_currency_impact) : null,
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
        claimedCurrencyImpact: vo.claimed_currency_impact,
        impactBasisStated: Boolean(vo.impact_basis),
      },
      healthState: planCursor.next('HB-0005'),
    });

    maybeFail(opts, 'model');

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
      healthState: planCursor.next('HB-0014'),
    });

    maybeFail(opts, 'commit');

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
      healthState: planCursor.next('HB-0018'),
    });

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
        realizedCurrencyImpact: vo.realized_currency_impact != null ? String(vo.realized_currency_impact) : null,
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
      healthState: planCursor.next('HB-0015'),
    });

    maybeFail(opts, 'measure');

    // ---- STAGE 6: verify -----------------------------------------------------------
    // a named human confirms sources and the delta — the disclosure gate.
    // anyActualEvidenceVerified / verifierSynthetic / canVerify / realization
    // were computed above, before STAGE 1, since the gate is pure fixture
    // arithmetic with no DB dependency. What happens here is the actual
    // consequence of that decision: the conditional UPDATE and the savepoint
    // proof that Postgres refuses the alternative.
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

    await db.update(schema.valueOutcomes).set({ valueStage: 'verify' }).where(eq(schema.valueOutcomes.id, valueOutcomeId));
    await db.update(schema.engagements).set({ valueStage: 'verify' }).where(eq(schema.engagements.id, seeded.engagement.id));

    await emit(ctx, 'HB-0016', {
      stage: 'verify',
      subjectTable: 'value_outcomes',
      subjectId: valueOutcomeId,
      actorPersonId: seeded.persons.verifier.id,
      payload: {
        realizationAdvancedTo: realization,
        anyActualEvidenceVerified,
        verifierSynthetic,
      },
      healthState: planCursor.next('HB-0016'),
    });

    maybeFail(opts, 'verify');

    // ---- STAGE 7: return -------------------------------------------------------------
    // the finding returns to the portfolio and to Rule76
    const recordPayload = {
      engagement: fixture.engagement.name,
      capability: fixture.capability.name,
      businessMetric: bm.name,
      baselineValue: vo.baseline_value,
      targetValue: vo.target_value,
      actualValue: vo.actual_value,
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
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
      healthState: planCursor.next('HB-0017'),
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
      healthState: planCursor.next('HB-0004'),
    });

    await db.update(schema.valueOutcomes).set({ valueStage: 'return' }).where(eq(schema.valueOutcomes.id, valueOutcomeId));
    await db.update(schema.engagements).set({ valueStage: 'return' }).where(eq(schema.engagements.id, seeded.engagement.id));

    maybeFail(opts, 'return');

    // ---- 0003: value_runs -----------------------------------------------------------
    // Computed, never asserted or estimated — db/CONFIDENCE_MODEL.md. The
    // computed band governs; value_outcomes.confidence is advisory only.
    const confidence = computeConfidence({
      metricDefinitionConfirmed: bm.calculation_confirmed,
      evidence: fixture.evidence.map((e) => fixtureEvidenceToInput(fixture, e)),
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
      impactBasisStated: Boolean(vo.impact_basis),
      impactIsInference: vo.impact_is_inference,
      sponsorName: seeded.persons.sponsor.fullName,
      verifierName: seeded.persons.verifier.fullName,
      assertedConfidence: vo.confidence,
    });

    // db/DELTA_AND_PROVENANCE.md Part 1 — the confirmation gap's per-outcome
    // half. Pure computation over already-known fixture values; no new write.
    const delta: DeltaResult = computeDelta({
      baselineValue: vo.baseline_value,
      targetValue: vo.target_value,
      actualValue: vo.actual_value,
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
      promisedMeasuredAt: vo.promised_measured_at,
      actualMeasuredAt: vo.actual_measured_at,
      direction: bm.direction,
    });

    // db/HEALTH_MODEL.md — COMPASS-HEARTBEAT-STATUS §7. Computed from the
    // ledger this walk actually emitted, not asserted. A dimension with no
    // events is UNMEASURED, not zero and not assumed compliant.
    const health = computeHealth(ctx.events);

    // db/FINDINGS_MODEL.md — payload only, empty array when none (never
    // null, never omitted: a run with no findings is a result, not an
    // absence of computation).
    const findings: Finding[] = computeFindings({
      unmappedEvents: health.unmappedEvents,
      sponsorSynthetic: fixture.persons.sponsor.synthetic,
      anyActualEvidenceVerified,
      verifierSynthetic,
      confidenceBand: confidence.band,
      confidenceScore: confidence.score,
    });

    const [{ priorRunCount }] = await db
      .select({ priorRunCount: sql<number>`count(*)::int` })
      .from(schema.valueRuns)
      .where(eq(schema.valueRuns.engagementId, seeded.engagement.id));
    const runNumber = priorRunCount + 1;

    // The run self-describes the walk that produced it, independent of who
    // reads the payload: records/render_record.py's heartbeat ledger table
    // reads heartbeatId/eventType/valueStage/category/producer/healthState/
    // contentHash per event — checked against that file's actual usage, not
    // inferred. `stage` is renamed to `valueStage` for this shape only; the
    // in-memory EmittedHeartbeat.stage name is unrelated and unchanged.
    const payloadEvents = ctx.events.map((e) => ({
      heartbeatId: e.heartbeatId,
      eventType: e.eventType,
      valueStage: e.stage,
      category: e.category,
      producer: e.producer,
      healthState: e.healthState,
      contentHash: e.contentHash,
    }));

    // payloadHash covers everything the run asserts about itself, including
    // its own identity and sequence — but not the hash field, which cannot
    // hash itself. The stored payload then carries all three so the
    // document is self-describing without joining back to its own row.
    const runPayloadBase = {
      valueRunId,
      runNumber,
      sourceFixture,
      engagement: fixture.engagement.name,
      capability: fixture.capability.name,
      businessMetric: bm.name,
      baselineValue: vo.baseline_value,
      targetValue: vo.target_value,
      actualValue: vo.actual_value,
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
      realization,
      disclosure,
      confidence,
      delta,
      health,
      findings,
      events: payloadEvents,
    };
    const payloadHash = sha256Hex(runPayloadBase);
    const runPayload = { ...runPayloadBase, payloadHash };

    await db.insert(schema.valueRuns).values({
      id: valueRunId,
      tenantId: seeded.tenant.id,
      engagementId: seeded.engagement.id,
      runNumber,
      terminalValueStage: 'return',
      confidenceScore: String(confidence.score),
      confidenceBand: confidence.band,
      institutionalHealth: health.composite != null ? String(health.composite) : null,
      healthBand: health.band,
      healthCoveragePct: health.coverage_pct,
      sourceFixture,
      payloadHash,
      payload: runPayload,
      walkedByPersonId: seeded.persons.valueEngineer.id,
    });
    rowsWritten.value_runs += 1;

    rowsWritten.heartbeat_events = ctx.events.length;

    return {
      seeded,
      valueRunId,
      runNumber,
      sourceFixture,
      payloadHash,
      runPayload,
      valueOutcomeId: valueOutcomeRow.id,
      recordDocumentId: recordDocument.id,
      stewardshipReturnId: stewardshipReturn.id,
      events: ctx.events,
      realization,
      disclosure,
      confidence,
      delta,
      health,
      findings,
      verifyGuard,
      rowsWritten,
    };
  });

  // After commit, never inside the transaction — a file written by a rolled
  // back walk would be a lie. Postgres stays authoritative; this file is a
  // rendering convenience derived from it, consumed by records/render_record.py
  // and records/confirmation_gap.py while the Python pipeline still exists.
  await writeSpineRunArtifact(result);

  return result;
}

async function writeSpineRunArtifact(result: WalkResult): Promise<string> {
  const outDir = fileURLToPath(new URL('../../records/out/', import.meta.url));
  await mkdir(outDir, { recursive: true });
  const path = `${outDir}spine_run_${result.sourceFixture}.json`;

  // Natural JSON types, not the numbers-as-strings form payload_hash was
  // computed over — db/CONFIDENCE_MODEL.md's "round-trip depends on
  // TypeScript being the only writer" section. Numbers-as-strings is a
  // hashing procedure, not a storage format: render_record.py and
  // confirmation_gap.py format these fields as numbers (`:,.0f`, `:+`,
  // `:.1%`), and a pre-stringified "2774880" fails every one of them. A
  // verifier that wants to check payload_hash parses this file and
  // canonicalises the parsed object itself, the same way stableStringify
  // does — it does not expect the file's own bytes to already be canonical.
  //
  // record_hash, not payload_hash: the file's top-level key matches
  // records/render_record.py's contract (`run['record_hash']`), which
  // predates this TypeScript pipeline and already has consumers. The
  // database column stays `payload_hash` — that name is correct and unrelated.
  const fileObject = {
    value_run_id: result.valueRunId,
    run_number: result.runNumber,
    record_hash: result.payloadHash,
    source_fixture: result.sourceFixture,
    ...result.runPayload,
  };
  await writeFile(path, JSON.stringify(fileObject, null, 2), 'utf-8');
  return path;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

/**
 * Usage: tsx walkSpine.ts [fixture.json] [--fail-at=<stage>]
 *
 * Every argument must be recognised. A fixture path that was typed wrong, or
 * a --fail-at value that doesn't match a real stage, must abort the process
 * rather than be silently dropped — a walk that runs to completion because
 * its input was quietly ignored is a passing test against the wrong thing,
 * which is worse than a crash.
 *
 * --fail-at=<stage>: development/test only. walkSpine() itself refuses to
 * honour opts.failAt when NODE_ENV === 'production', so this flag cannot
 * abort a real walk in production even if passed by mistake.
 */
function parseArgs(argv: string[]): { fixtureFile?: string; failAt?: ValueStage } {
  const FAIL_AT_PREFIX = '--fail-at=';
  let fixtureFile: string | undefined;
  let failAt: ValueStage | undefined;

  for (const arg of argv) {
    if (arg.startsWith(FAIL_AT_PREFIX)) {
      const value = arg.slice(FAIL_AT_PREFIX.length);
      if (!(schema.valueStage.enumValues as readonly string[]).includes(value)) {
        console.error(
          `Unrecognised --fail-at value "${value}". Must be one of: ${schema.valueStage.enumValues.join(', ')}.`,
        );
        process.exit(1);
      }
      if (failAt !== undefined) {
        console.error('--fail-at passed more than once.');
        process.exit(1);
      }
      failAt = value as ValueStage;
    } else if (arg.startsWith('--')) {
      console.error(`Unrecognised argument "${arg}". Only a fixture filename and --fail-at=<stage> are accepted.`);
      process.exit(1);
    } else {
      if (fixtureFile !== undefined) {
        console.error(`Only one fixture path is accepted; got both "${fixtureFile}" and "${arg}".`);
        process.exit(1);
      }
      fixtureFile = arg;
    }
  }

  if (failAt !== undefined && process.env.NODE_ENV === 'production') {
    console.error('--fail-at is refused when NODE_ENV=production; ignoring.');
    failAt = undefined;
  }

  return { fixtureFile, failAt };
}

if (isMain) {
  const { fixtureFile, failAt } = parseArgs(process.argv.slice(2));
  walkSpine({ fixtureFile, failAt })
    .then((result) => {
      console.log(`Value spine walk complete — ${fixtureFile ?? 'customer_zero.json'}.\n`);
      console.log(`value_run           ${result.valueRunId}`);
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
      console.log(
        `Confidence          ${result.confidence.score.toFixed(1)} / ${result.confidence.band.toUpperCase()}` +
          (result.confidence.overridesAssertion ? ` (overrides asserted ${result.confidence.asserted})` : ''),
      );

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
