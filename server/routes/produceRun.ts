import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import {
  computeConfidence,
  evidenceCredit,
  type ConfidenceEvidenceInput,
  type ConfidenceInput,
} from '../spine/confidenceModel.js';
import { computeDelta, type DeltaInput } from '../spine/deltaEngine.js';
import { computeHealth, type HealthEventInput } from '../spine/healthModel.js';
import { computeFindings, type Finding } from '../spine/findingsModel.js';
import { sha256Hex } from '../spine/hash.js';
import { emitHeartbeat } from '../spine/emitHeartbeat.js';
import { handleGovernanceError } from '../lib/refusal.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 *
 * walkSpine.ts produces a value_runs row for the Customer Zero fixture and
 * nothing else can — this is the missing entry point for live data. It
 * reproduces walkSpine.ts's payload shape and value_runs insert (lines
 * 860-1015) against real rows instead of a fixture. It does not reproduce
 * the rest of the walk: it does not create the engagement, the value
 * outcome, or any evidence (those are offeringAttachment.ts,
 * valueOutcomes.ts, outcomeWalk.ts), and it does not move the engagement or
 * outcome's own value_stage — this endpoint only reads and snapshots.
 *
 * Named /produce-run, not /lock: value_runs has its own locked_at /
 * locked_by_person_id / lock_reason columns and an immutability trigger
 * (lvrf_locked_run_immutable) that engages once locked_at is set. This
 * endpoint sets none of them — it reproduces walkSpine's insert shape
 * exactly, which also leaves a walked run unlocked. Calling this route
 * "/lock" while it never touches those columns would be the same
 * record-versus-reality gap this project keeps finding elsewhere. A real
 * lock/relock action (cut-roster item 3) is a separate, later endpoint,
 * and it can now own that name without colliding with this one.
 *
 * A HYPOTHESIS RUN IS FIRST-CLASS. An Outside-In baseline — realization
 * 'claimed', confidence low, no verifier — is a complete, producible,
 * defensible state, not a failed attempt at 'measured'. Nothing here
 * penalizes that state beyond what the confidence and health models already
 * score honestly.
 */

class ValidationError extends Error {}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} is required`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function optionalNullableString(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  const v = obj[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ValidationError(`${path}.${field} must be a string or null`);
  }
  return v;
}

function toNumber(v: string | null): number | null {
  return v === null ? null : Number(v);
}

function toIso(v: Date | null): string | null {
  return v === null ? null : v.toISOString();
}

export function produceRunRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:engagementId/produce-run', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const engagementId = req.params.engagementId;
    if (!isUuid(engagementId)) {
      res.status(400).json({ message: `invalid engagement id: ${engagementId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record.
    let refusalTenantId: string | null = null;
    let refusalInstitutionId: string | null = null;

    try {
      const body = requireObject(req.body, 'body');
      const note = requireString(body, 'note', 'body');
      const bannerTitle = optionalNullableString(body, 'banner_title', 'body') ?? 'PROVENANCE';
      const sourceFixture = requireString(body, 'source_fixture', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [engagement] } = await client.query<{
        id: string;
        tenant_id: string;
        institution_id: string;
        name: string;
      }>(
        `SELECT id, tenant_id, institution_id, name
           FROM engagements WHERE id = $1 AND deleted_at IS NULL`,
        [engagementId],
      );
      if (!engagement) {
        res.status(404).json({ message: `engagement ${engagementId} not found` });
        return;
      }
      refusalTenantId = engagement.tenant_id;
      refusalInstitutionId = engagement.institution_id;

      // The payload shape holds exactly ONE capability and ONE
      // businessMetric per run — multi-outcome runs are a 2.0 cohort
      // concern, not something to approximate by picking one arbitrarily.
      const { rows: outcomes } = await client.query<{
        id: string;
        capability_id: string;
        business_metric_id: string;
        value_stage: string;
        baseline_value: string;
        target_value: string | null;
        actual_value: string | null;
        claimed_currency_impact: string | null;
        realized_currency_impact: string | null;
        impact_basis: string | null;
        promised_measured_at: Date | null;
        actual_measured_at: Date | null;
        realization: string;
        confidence: 'low' | 'medium' | 'high';
        committed_by_person_id: string | null;
        verified_by_person_id: string | null;
      }>(
        `SELECT id, capability_id, business_metric_id, value_stage,
                baseline_value, target_value, actual_value,
                claimed_currency_impact, realized_currency_impact, impact_basis,
                promised_measured_at, actual_measured_at,
                realization, confidence, committed_by_person_id, verified_by_person_id
           FROM value_outcomes
          WHERE engagement_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [engagementId],
      );
      if (outcomes.length === 0) {
        res.status(422).json({
          message: `engagement ${engagementId} has no value outcome; nothing to lock`,
        });
        return;
      }
      if (outcomes.length > 1) {
        res.status(422).json({
          message:
            `engagement ${engagementId} has ${outcomes.length} value outcomes. This endpoint's ` +
            'payload shape holds exactly one capability and one businessMetric per run — ' +
            'multi-outcome runs are a 2.0 cohort concern.',
        });
        return;
      }
      const vo = outcomes[0];

      const { rows: [capability] } = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM capabilities WHERE id = $1 AND deleted_at IS NULL',
        [vo.capability_id],
      );
      // LEFT JOIN persons on definition_confirmed_by_person_id: the
      // confirmation pair is optional (migration 0013's both-or-neither
      // CHECK), and when set, its confirmer's simulated status is what
      // decides whether metric_definition_confirmed may earn credit —
      // the same rule lvrf_block_simulated_attestor enforces at the
      // database.
      const { rows: [bm] } = await client.query<{
        name: string;
        unit: string;
        direction: 'increase' | 'decrease';
        source_system: string;
        definition_notes: string | null;
        definition_confirmed_by_person_id: string | null;
        definition_confirmed_at: Date | null;
        confirmer_simulated: boolean | null;
      }>(
        `SELECT bm.name, bm.unit, bm.direction, bm.source_system,
                bm.definition_notes, bm.definition_confirmed_by_person_id,
                bm.definition_confirmed_at, p.simulated AS confirmer_simulated
           FROM business_metrics bm
           LEFT JOIN persons p ON p.id = bm.definition_confirmed_by_person_id
          WHERE bm.id = $1 AND bm.deleted_at IS NULL`,
        [vo.business_metric_id],
      );
      if (!capability || !bm) {
        // Both are NOT NULL, ON DELETE RESTRICT foreign keys on value_outcomes
        // — reachable only if a row was soft-deleted after being linked.
        throw new Error(
          `value outcome ${vo.id} references a soft-deleted capability or business metric`,
        );
      }

      // DEFECT-002's fix, reproduced: read evidence back from the database,
      // inside this same transaction, rather than trust any in-memory copy.
      // `supports` comes from value_outcome_evidence (the join). The
      // attester's name, tenant, institution and simulated status come from
      // `persons` via evidence.attested_by_person_id — a LEFT JOIN, since
      // attestation is optional per row and independent of kind.
      const { rows: evidenceRows } = await client.query<{
        kind: string;
        summary: string;
        provenance: string;
        source_reference: string | null;
        confidence_level: 'low' | 'medium' | 'high';
        source_verified: boolean;
        ai_sourced: boolean;
        citation_resolved: boolean;
        simulated: boolean;
        supports: string;
        attester_name: string | null;
        attester_tenant_id: string | null;
        attester_institution_id: string | null;
        attester_simulated: boolean | null;
      }>(
        `SELECT
           e.kind, e.summary, e.provenance, e.source_reference,
           e.confidence AS confidence_level, e.source_verified, e.ai_sourced,
           e.citation_resolved, e.simulated,
           voe.supports,
           p.full_name AS attester_name,
           p.tenant_id AS attester_tenant_id,
           p.institution_id AS attester_institution_id,
           p.simulated AS attester_simulated
         FROM value_outcome_evidence voe
         JOIN evidence e ON e.id = voe.evidence_id
         LEFT JOIN persons p ON p.id = e.attested_by_person_id
        WHERE voe.value_outcome_id = $1
        ORDER BY e.created_at`,
        [vo.id],
      );

      const evidenceForConfidence: ConfidenceEvidenceInput[] = evidenceRows.map((r) => ({
        kind: r.kind,
        sourceVerified: r.source_verified,
        supports: r.supports as ConfidenceEvidenceInput['supports'],
        attestedByName: r.attester_name,
        attestedByScope: r.attester_name != null ? (r.attester_institution_id ? 'institution' : 'tenant') : null,
        attesterSimulated: r.attester_simulated ?? false,
      }));

      // evidenceSnapshot per walkSpine.ts:870, plus `simulated` (a real
      // column, added 24 August, that snapshot predates) and
      // `vendor_published` (derived from kind — no such column exists).
      // Without these two a run cannot show that its own evidence was
      // synthetic or vendor-published, which is exactly the distinction
      // lvrf_block_ai_actual and AMENDMENT-005 turn on.
      const evidenceSnapshot = evidenceRows.map((r) => ({
        kind: r.kind,
        summary: r.summary,
        provenance: r.provenance,
        source_reference: r.source_reference,
        confidence: r.confidence_level,
        source_verified: r.source_verified,
        ai_sourced: r.ai_sourced,
        citation_resolved: r.citation_resolved,
        supports: r.supports,
        simulated: r.simulated,
        vendor_published: r.kind === 'vendor_publication',
      }));

      // ANY, not EVERY — db/CONFIDENCE_MODEL.md's verification gate, ported
      // from walkSpine.ts exactly: one item clearing (independently
      // verified, or attested by a named, institution-scoped, non-synthetic
      // authority) is enough.
      const actualEvidence = evidenceForConfidence.filter((e) => e.supports === 'actual');
      const anyActualEvidenceVerified =
        actualEvidence.length > 0 && actualEvidence.some((e) => evidenceCredit(e).credit > 0);

      // human_commit_of_record asks "did a named, non-synthetic person
      // commit to THE TARGET?" — answered by the outcome's own committer
      // (vo.committed_by_person_id), not by whoever sponsors the engagement
      // relationship. Mirrors the verifier block directly beneath it, which
      // already reads vo.verified_by_person_id the same way.
      //
      // Safe to change now, not later: no LOCKED run — the only kind whose
      // stored score is actually immutable — has ever earned credit on this
      // factor (verified locally: zero of the locked runs in this database
      // even carry a human_commit_of_record entry in their payload, let
      // alone one with earned > 0), so no stored score's VALUE changes. But
      // the argument is general, not particular to this factor: a change to
      // what a factor READS changes what every prior score MEANT, and
      // nothing today records which model version scored a given run. That
      // gap is the concrete case for versioned model weights (BUILD_STATUS.md,
      // 2.0 scope) — this edit is safe only because it happens to land before
      // anything depended on the old meaning, not because the system would
      // have caught it if something had.
      let committerSynthetic: boolean;
      let committerName: string | null;
      if (vo.committed_by_person_id) {
        const { rows: [committer] } = await client.query<{ full_name: string; simulated: boolean }>(
          'SELECT full_name, simulated FROM persons WHERE id = $1 AND deleted_at IS NULL',
          [vo.committed_by_person_id],
        );
        committerSynthetic = !committer || committer.simulated;
        committerName = committer ? committer.full_name : null;
      } else {
        committerSynthetic = true;
        committerName = null;
      }

      let verifierSynthetic: boolean;
      let verifierName: string | null;
      if (vo.verified_by_person_id) {
        const { rows: [verifier] } = await client.query<{ full_name: string; simulated: boolean }>(
          'SELECT full_name, simulated FROM persons WHERE id = $1 AND deleted_at IS NULL',
          [vo.verified_by_person_id],
        );
        verifierSynthetic = !verifier || verifier.simulated;
        verifierName = verifier ? verifier.full_name : null;
      } else {
        verifierSynthetic = true;
        verifierName = null;
      }

      const claimedCurrencyImpact = toNumber(vo.claimed_currency_impact);
      const realizedCurrencyImpact = toNumber(vo.realized_currency_impact);

      // Credit requires all three: documented, confirmed, and confirmed by
      // a real person — any one missing earns 0. A confirmation without
      // notes documents nothing; notes without a confirmer are unattested.
      // Checked in this order so the gap reported is the first one that
      // actually blocks credit, matching the order the factor's question
      // asks them in.
      const hasDefinitionNotes = Boolean(bm.definition_notes && bm.definition_notes.trim() !== '');
      const isDefinitionConfirmed =
        bm.definition_confirmed_by_person_id !== null && bm.definition_confirmed_at !== null;
      const confirmerSimulated = bm.confirmer_simulated ?? false;

      let metricDefinitionConfirmed: boolean;
      let metricDefinitionGap: ConfidenceInput['metricDefinitionGap'];
      if (!hasDefinitionNotes) {
        metricDefinitionConfirmed = false;
        metricDefinitionGap = 'no_notes';
      } else if (!isDefinitionConfirmed) {
        metricDefinitionConfirmed = false;
        metricDefinitionGap = 'unconfirmed';
      } else if (confirmerSimulated) {
        metricDefinitionConfirmed = false;
        metricDefinitionGap = 'confirmer_simulated';
      } else {
        metricDefinitionConfirmed = true;
      }

      const confidenceInput: ConfidenceInput = {
        metricDefinitionConfirmed,
        metricDefinitionGap,
        evidence: evidenceForConfidence,
        claimedCurrencyImpact,
        realizedCurrencyImpact,
        impactBasisStated: Boolean(vo.impact_basis),
        // Same reasoning: no live column says a stated currency impact was
        // measured rather than inferred. The model already scores an
        // inference at half credit — treating every live impact as an
        // inference until something proves otherwise means a hypothesis run
        // scores low because it IS one, not because anyone chose to
        // penalize it.
        impactIsInference: true,
        committerName,
        committerSimulated: committerSynthetic,
        verifierName,
        verifierSimulated: verifierSynthetic,
        assertedConfidence: vo.confidence,
      };
      const confidence = computeConfidence(confidenceInput);

      const deltaInput: DeltaInput = {
        baselineValue: Number(vo.baseline_value),
        targetValue: toNumber(vo.target_value),
        actualValue: toNumber(vo.actual_value),
        claimedCurrencyImpact,
        realizedCurrencyImpact,
        promisedMeasuredAt: toIso(vo.promised_measured_at),
        actualMeasuredAt: toIso(vo.actual_measured_at),
        direction: bm.direction,
      };
      const delta = computeDelta(deltaInput);

      // This endpoint deliberately emits NO heartbeat events — walkSpine's
      // buildHeartbeatPlan sequence is tied to a fixture walk, and emitting
      // a partial or guessed sequence here would corrupt the health
      // register, which is the instrument. Health is computed only from
      // heartbeat_events already associated with this engagement, read
      // live. Runtime heartbeat emission is still deferred (BUILD_STATUS.md
      // — "the register is a photograph"), so today this set is legitimately
      // empty for any engagement outside the fixture walk: every dimension
      // reports UNMEASURED and composite is null. That is the honest result
      // of the register not yet being live, not a bug in this endpoint.
      const { rows: heartbeatRows } = await client.query<{
        heartbeat_id: string;
        event_type: string;
        value_stage: string | null;
        category: string;
        producer: string;
        health_state: HealthEventInput['healthState'];
        content_hash: string;
        health_weight: number;
      }>(
        `SELECT he.heartbeat_id, he.event_type, he.value_stage, h.category,
                he.producer, he.health_state, he.content_hash, h.health_weight
           FROM heartbeat_events he
           JOIN heartbeats h ON h.id = he.heartbeat_id
          WHERE he.engagement_id = $1
          ORDER BY he.id`,
        [engagementId],
      );
      const healthEvents: HealthEventInput[] = heartbeatRows.map((r) => ({
        heartbeatId: r.heartbeat_id,
        category: r.category,
        healthWeight: r.health_weight,
        healthState: r.health_state,
      }));
      const health = computeHealth(healthEvents);

      const payloadEvents = heartbeatRows.map((r) => ({
        heartbeatId: r.heartbeat_id,
        eventType: r.event_type,
        valueStage: r.value_stage,
        category: r.category,
        producer: r.producer,
        healthState: r.health_state,
        contentHash: r.content_hash,
      }));

      const findings: Finding[] = computeFindings({
        unmappedEvents: health.unmappedEvents,
        committerSynthetic,
        anyActualEvidenceVerified,
        verifierSynthetic,
        confidenceBand: confidence.band,
        confidenceScore: confidence.score,
      });

      // realization/disclosure are read from the outcome's actual, current
      // state — never recomputed or asserted here. Advancing realization is
      // outcomeWalk.ts's job (/measure, /verify); this endpoint only
      // snapshots whatever state already exists. Same ternary as walkSpine:
      // verified -> customer_shared, everything else -> internal. Derived,
      // never authored.
      const realization = vo.realization;
      const disclosure = realization === 'verified' ? 'customer_shared' : 'internal';

      // terminalValueStage is the outcome's ACTUAL value_stage — never
      // 'return' unless it got there. This endpoint does not advance it.
      const terminalValueStage = vo.value_stage;

      const { rows: [{ next_run_number: runNumber }] } = await client.query<{ next_run_number: number }>(
        'SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run_number FROM value_runs WHERE engagement_id = $1',
        [engagementId],
      );

      const valueRunId = randomUUID();

      // payloadHash covers everything the run asserts about itself,
      // including its own identity and sequence — but not the hash field,
      // which cannot hash itself. Same order as walkSpine.
      //
      // valueOutcomeId is now one of the fields it covers, so a run produced
      // from now on hashes differently than one produced before this change.
      // That is correct — a payload with more in it is a different payload —
      // not a sign that an older run's stored hash has been corrupted.
      const runPayloadBase = {
        valueRunId,
        runNumber,
        sourceFixture,
        engagement: engagement.name,
        capability: capability.name,
        // The outcome this run snapshots. `vo` was already loaded above to
        // build confidence/delta inputs — reused here, not re-queried. Added
        // so the client can link a run back to
        // POST /api/value-outcomes/:outcomeId/evidence, which nothing in the
        // payload previously carried.
        valueOutcomeId: vo.id,
        businessMetric: {
          name: bm.name,
          unit: bm.unit,
          direction: bm.direction,
          sourceSystem: bm.source_system,
        },
        baselineValue: Number(vo.baseline_value),
        targetValue: toNumber(vo.target_value),
        actualValue: toNumber(vo.actual_value),
        claimedCurrencyImpact,
        realizedCurrencyImpact,
        realization,
        disclosure,
        note,
        bannerTitle,
        confidence,
        delta,
        health,
        findings,
        events: payloadEvents,
        evidence: evidenceSnapshot,
      };
      const payloadHash = sha256Hex(runPayloadBase);
      const runPayload = { ...runPayloadBase, payloadHash };

      // Not set here: locked_at / locked_by_person_id / lock_reason — see
      // the file header on why this route is named /produce-run rather
      // than /lock. walkSpine's own value_runs insert (lines 998-1013)
      // does not set them either.
      const { rows: [valueRun] } = await client.query<{ id: string }>(
        `INSERT INTO value_runs (
           id, tenant_id, engagement_id, run_number, terminal_value_stage,
           confidence_score, confidence_band, institutional_health, health_band,
           health_coverage_pct, source_fixture, payload_hash, payload, walked_by_person_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          valueRunId, engagement.tenant_id, engagementId, runNumber, terminalValueStage,
          String(confidence.score), confidence.band,
          health.composite != null ? String(health.composite) : null, health.band,
          health.coverage_pct, sourceFixture, payloadHash, runPayload, actorPersonId,
        ],
      );

      // HB-0008 Snapshot Created. Same transaction as the insert above — if
      // this throws, the whole transaction rolls back, the run included. A
      // governed write with no record of it is worse than no write.
      await emitHeartbeat(client, {
        heartbeatId: 'HB-0008',
        tenantId: engagement.tenant_id,
        institutionId: engagement.institution_id,
        engagementId,
        valueRunId: valueRun.id,
        subjectTable: 'value_runs',
        subjectId: valueRun.id,
        actorPersonId,
        healthState: 'healthy',
        payload: {
          run_number: runNumber,
          source_fixture: sourceFixture,
        },
      });

      res.status(201).json({
        value_run_id: valueRun.id,
        run_number: runNumber,
        confidence_score: confidence.score,
        confidence_band: confidence.band,
        health_composite: health.composite,
        health_band: health.band,
        health_coverage_pct: health.coverage_pct,
        terminal_value_stage: terminalValueStage,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault. Its
      // message names the amendment and the reason — that message IS the
      // product here, so it goes to the caller unchanged, not swallowed
      // into a generic 500. handleGovernanceError also records the attempt
      // — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/engagements/:engagementId/produce-run',
        subjectTable: 'value_runs',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: refusalInstitutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
