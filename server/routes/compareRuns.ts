import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

/**
 * GET, not a mutating method — actorContext's MUTATING_METHODS set does not
 * include GET, so it calls next() immediately without opening a transaction
 * or attaching req.dbClient. req.dbClient is undefined here; every query in
 * this file runs on the pool directly, same as runs.ts and engagements.ts.
 *
 * WHY THIS PERSISTS NOTHING: both runs this endpoint compares must be
 * locked (checked below), and lvrf_locked_run_immutable makes a locked row
 * unchangeable. A comparison between two immutable rows is deterministic
 * and reproducible on demand — the same two ids always produce the same
 * diff — so storing the result would be pure accumulation with no benefit.
 * CVAF built a persisted compare and deliberately reversed it for exactly
 * this reason; that reasoning transfers here. No table, no row, no cache —
 * this is a read that computes its answer from two payload columns and
 * returns it.
 *
 * Reads value_runs.payload as already stored — no recomputation. The
 * factor/health/confidence shapes here are produceRun.ts's and
 * walkSpine.ts's runPayloadBase, which are identical on this point (both
 * feed the same confidenceModel.ts / healthModel.ts outputs into the same
 * field names), so this endpoint works on a run from either origin.
 */

// businessMetric is a bare string on runs walked before it was enriched, an
// object with unit/direction/sourceSystem after — client/src/types/run.ts's
// BusinessMetricDetail distinction, reproduced here because the server is
// just as exposed to an older payload shape as the client is.
function businessMetricDetail(bm: unknown): { name: string; unit: string | null; direction: string | null } {
  if (typeof bm === 'string') {
    return { name: bm, unit: null, direction: null };
  }
  if (bm !== null && typeof bm === 'object') {
    const obj = bm as Record<string, unknown>;
    return {
      name: typeof obj.name === 'string' ? obj.name : '',
      unit: typeof obj.unit === 'string' ? obj.unit : null,
      direction: typeof obj.direction === 'string' ? obj.direction : null,
    };
  }
  return { name: '', unit: null, direction: null };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface PayloadFactor {
  factor: string;
  question: string;
  weight: number;
  earned: number;
  note: string;
}

interface ComparedFactor {
  factor: string;
  question: string;
  weight: number;
  earned_from: number | null;
  earned_to: number | null;
  delta: number | null;
  note_from: string | null;
  note_to: string | null;
  status: 'present' | 'added' | 'removed';
}

// GET /api/value-runs/:baselineRunId/compare/:comparisonRunId — compares two
// locked value runs factor by factor. A read; writes nothing.
export function compareRunsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:baselineRunId/compare/:comparisonRunId', async (req, res) => {
    const { baselineRunId, comparisonRunId } = req.params;

    if (!isUuid(baselineRunId)) {
      res.status(400).json({ message: `invalid baseline run id: ${baselineRunId}` });
      return;
    }
    if (!isUuid(comparisonRunId)) {
      res.status(400).json({ message: `invalid comparison run id: ${comparisonRunId}` });
      return;
    }
    if (baselineRunId === comparisonRunId) {
      res.status(422).json({ message: 'baselineRunId and comparisonRunId must be different runs' });
      return;
    }

    try {
      const { rows } = await pool.query<{
        id: string;
        engagement_id: string;
        locked_at: Date | null;
        terminal_value_stage: string;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, engagement_id, locked_at, terminal_value_stage, payload
           FROM value_runs
          WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [[baselineRunId, comparisonRunId]],
      );
      const baseline = rows.find((r) => r.id === baselineRunId);
      const comparison = rows.find((r) => r.id === comparisonRunId);

      if (!baseline) {
        res.status(404).json({ message: `value run ${baselineRunId} not found` });
        return;
      }
      if (!comparison) {
        res.status(404).json({ message: `value run ${comparisonRunId} not found` });
        return;
      }

      // A comparison against a mutable row is a snapshot of something that
      // can still change — the result would not be reproducible.
      if (baseline.locked_at === null) {
        res.status(409).json({ message: `value run ${baselineRunId} is not locked; cannot compare` });
        return;
      }
      if (comparison.locked_at === null) {
        res.status(409).json({ message: `value run ${comparisonRunId} is not locked; cannot compare` });
        return;
      }

      // Comparing runs across engagements compares two different claims,
      // not the same claim at two moments.
      if (baseline.engagement_id !== comparison.engagement_id) {
        res.status(422).json({
          message: `value runs ${baselineRunId} and ${comparisonRunId} belong to different engagements; cannot compare`,
        });
        return;
      }

      const bp = baseline.payload;
      const cp = comparison.payload;
      const bConfidence = bp.confidence as {
        score: number;
        band: string;
        factors: PayloadFactor[];
        modelVersion?: string;
        modelFingerprint?: string;
      };
      const cConfidence = cp.confidence as {
        score: number;
        band: string;
        factors: PayloadFactor[];
        modelVersion?: string;
        modelFingerprint?: string;
      };
      const bHealth = bp.health as { composite: number | null; coverage_pct: number };
      const cHealth = cp.health as { composite: number | null; coverage_pct: number };

      // Neither field back-fills — a run scored before confidenceModel.ts
      // computed them stays absent, honestly, rather than defaulting to
      // "comparable". See confidenceModel.ts's MODEL_VERSION/MODEL_FINGERPRINT
      // comment: the fingerprint is what makes a same-version, different-
      // constant change (an unamended amendment) detectable rather than
      // merely stated, and this endpoint is where that detection surfaces.
      const bVersion = bConfidence.modelVersion ?? null;
      const cVersion = cConfidence.modelVersion ?? null;
      const bFingerprint = bConfidence.modelFingerprint ?? null;
      const cFingerprint = cConfidence.modelFingerprint ?? null;

      let modelComparable: boolean;
      let modelNote: string;
      if (bFingerprint === null || cFingerprint === null) {
        // At least one run predates model versioning. The model that scored
        // it is unknown — not "assumed same" — so the comparison cannot be
        // qualified. This is the state all sixteen existing production runs
        // are in; it is not an error case.
        modelComparable = false;
        if (bFingerprint === null && cFingerprint === null) {
          modelNote = `Both runs (${baselineRunId} and ${comparisonRunId}) predate model versioning — the model that scored each is unknown, so the comparison cannot be qualified.`;
        } else if (bFingerprint === null) {
          modelNote = `Run ${baselineRunId} predates model versioning — the model that scored it is unknown, so the comparison cannot be qualified.`;
        } else {
          modelNote = `Run ${comparisonRunId} predates model versioning — the model that scored it is unknown, so the comparison cannot be qualified.`;
        }
      } else if (bFingerprint === cFingerprint) {
        modelComparable = true;
        modelNote = 'Both runs were scored by the same model.';
      } else {
        modelComparable = false;
        modelNote = `Runs were scored by different models — fingerprint ${bFingerprint} vs ${cFingerprint}. A factor delta may reflect a change in the model rather than a change in the evidence.`;
        if (bVersion !== null && cVersion !== null && bVersion === cVersion) {
          modelNote += ` Declared model version is the same (${bVersion}) on both runs despite the differing fingerprint — a model constant changed without the version being amended.`;
        }
      }

      // Join on `factor`. A factor present in one run and not the other is
      // 'added' or 'removed' — never a fabricated zero, so delta is null
      // (not 0) whenever either side is missing.
      const fromByFactor = new Map(bConfidence.factors.map((f) => [f.factor, f]));
      const toByFactor = new Map(cConfidence.factors.map((f) => [f.factor, f]));
      const allFactorKeys = new Set([...fromByFactor.keys(), ...toByFactor.keys()]);

      const factors: ComparedFactor[] = [];
      for (const key of allFactorKeys) {
        const from = fromByFactor.get(key);
        const to = toByFactor.get(key);
        if (from && to) {
          factors.push({
            factor: key,
            question: to.question,
            weight: to.weight,
            earned_from: from.earned,
            earned_to: to.earned,
            delta: round1(to.earned - from.earned),
            note_from: from.note,
            note_to: to.note,
            status: 'present',
          });
        } else if (from && !to) {
          factors.push({
            factor: key,
            question: from.question,
            weight: from.weight,
            earned_from: from.earned,
            earned_to: null,
            delta: null,
            note_from: from.note,
            note_to: null,
            status: 'removed',
          });
        } else if (to) {
          factors.push({
            factor: key,
            question: to.question,
            weight: to.weight,
            earned_from: null,
            earned_to: to.earned,
            delta: null,
            note_from: null,
            note_to: to.note,
            status: 'added',
          });
        }
      }

      // Delta descending, weight descending on ties, so what moved appears
      // first. added/removed rows (delta null) have not "moved" in a
      // measurable sense and sort after every row with a real delta.
      factors.sort((a, b) => {
        if (a.delta !== null && b.delta !== null) {
          if (b.delta !== a.delta) return b.delta - a.delta;
          return b.weight - a.weight;
        }
        if ((a.delta !== null) !== (b.delta !== null)) {
          return a.delta !== null ? -1 : 1;
        }
        return b.weight - a.weight;
      });

      const bMetric = businessMetricDetail(bp.businessMetric);
      const cMetric = businessMetricDetail(cp.businessMetric);

      res.status(200).json({
        baseline_run_id: baselineRunId,
        comparison_run_id: comparisonRunId,
        engagement_id: baseline.engagement_id,
        model: {
          version_from: bVersion,
          version_to: cVersion,
          fingerprint_from: bFingerprint,
          fingerprint_to: cFingerprint,
          comparable: modelComparable,
          note: modelNote,
        },
        confidence: {
          score_from: bConfidence.score,
          score_to: cConfidence.score,
          delta: round1(cConfidence.score - bConfidence.score),
          band_from: bConfidence.band,
          band_to: cConfidence.band,
          band_changed: bConfidence.band !== cConfidence.band,
        },
        factors,
        health: {
          // Never 0 for an unmeasured composite — that would assert a real
          // score the model never computed.
          composite_from: bHealth.composite ?? 'UNMEASURED',
          composite_to: cHealth.composite ?? 'UNMEASURED',
          coverage_from: bHealth.coverage_pct,
          coverage_to: cHealth.coverage_pct,
        },
        stage: {
          from: baseline.terminal_value_stage,
          to: comparison.terminal_value_stage,
        },
        claim: {
          metric_name_from: bMetric.name,
          metric_name_to: cMetric.name,
          // The same engagement's runs should be about the same claim; a
          // difference here is a finding, not something to silently prefer
          // one side of.
          metric_name_differs: bMetric.name !== cMetric.name,
          unit_from: bMetric.unit,
          unit_to: cMetric.unit,
          direction_from: bMetric.direction,
          direction_to: cMetric.direction,
          baseline_value_from: bp.baselineValue ?? null,
          baseline_value_to: cp.baselineValue ?? null,
        },
        notes: {
          note_from: (bp.note as string | undefined) ?? null,
          note_to: (cp.note as string | undefined) ?? null,
          banner_title_from: (bp.bannerTitle as string | undefined) ?? null,
          banner_title_to: (cp.bannerTitle as string | undefined) ?? null,
        },
      });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
