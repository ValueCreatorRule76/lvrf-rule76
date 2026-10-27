import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

export function runsRouter(pool: Pool): Router {
  const router = Router();

  // Full row, payload included, unreshaped. render_record.py and the workbench
  // read the same jsonb object stored at walk time — no transformation layer
  // here for them to silently diverge across.
  //
  // vr.* also returns steward_person_id, version, superseded_by_id, and
  // other governance columns the workbench has no use for. Fine while nothing
  // here is customer data; once auth lands and payloads carry real customer
  // content, this should become an explicit column list rather than whatever
  // governance() happens to add to value_runs next.
  //
  // institution_id/institution_name are new — the owner join, same path
  // runsIndex.ts uses. LEFT JOIN, not JOIN: this endpoint's whole contract
  // is "return this run if it exists," and an INNER join would turn a run
  // whose engagement or institution was later soft-deleted into a 404 for
  // an id that is very much still there. Null here means exactly that —
  // never substitute the engagement name or anything else in its place.
  router.get('/:id', async (req, res) => {
    if (!isUuid(req.params.id)) {
      res.status(400).json({ message: `invalid run id: ${req.params.id}` });
      return;
    }
    try {
      const { rows: [run] } = await pool.query(
        `SELECT vr.*, i.id AS institution_id, i.name AS institution_name,
                (e.deleted_at IS NOT NULL OR e.superseded_by_id IS NOT NULL) AS engagement_retired
           FROM value_runs vr
           -- L26: the engagement whatever its state (see runsIndex.ts).
           LEFT JOIN engagements e ON e.id = vr.engagement_id
           LEFT JOIN institutions i ON i.id = e.institution_id AND i.deleted_at IS NULL
          WHERE vr.id = $1 AND vr.deleted_at IS NULL`,
        [req.params.id],
      );
      // vr.* carries the run's own tenant_id (sign-in P3).
      if (!run || isOtherTenant(req, run.tenant_id, { table: 'value_runs', id: req.params.id })) {
        res.status(404).json({ message: `run ${req.params.id} not found` });
        return;
      }
      // C1: the errata recorded beside this sealed run (never part of it), every one of them;
      // a superseded erratum names its successor, and a superseding one its predecessor.
      const { rows: errata } = await pool.query(
        `SELECT x.id, x.kind, x.points_not_credited, x.evidence_id, x.corrected_to_supports, x.what_was_wrong, x.what_is_right, x.reason, x.model_version, x.model_fingerprint,
                x.sealed_score, x.sealed_band, x.recomputed_score, x.recomputed_band, x.recompute_method,
                p.full_name AS recorded_by, x.recorded_at,
                x.supersedes_id, x.supersession_reason,
                (SELECT q.full_name FROM run_errata o JOIN persons q ON q.id = o.recorded_by_person_id WHERE o.id = x.supersedes_id) AS supersedes_recorded_by,
                (SELECT o.recorded_at FROM run_errata o WHERE o.id = x.supersedes_id) AS supersedes_recorded_at,
                (SELECT s.id FROM run_errata s WHERE s.supersedes_id = x.id) AS superseded_by_id
           FROM run_errata x JOIN persons p ON p.id = x.recorded_by_person_id
          WHERE x.value_run_id = $1 ORDER BY x.recorded_at`,
        [req.params.id],
      );
      // C3: the run's system-exercise mark, and the marks on the evidence it sealed (matched as the
      // seal names it: kind, summary and provenance, within the run's account).
      const { rows: [mark] } = await pool.query<{ m: unknown }>('SELECT lvrf_system_exercise_mark($1, $2::uuid) AS m', ['value_runs', req.params.id]);
      const { rows: markedEvidence } = await pool.query(
        `SELECT x->>'kind' AS kind, x->>'summary' AS summary, x->>'provenance' AS provenance, lvrf_system_exercise_mark('evidence', e.id) AS system_exercise
           FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x
           JOIN evidence e ON e.institution_id = $2 AND e.kind::text = x->>'kind' AND e.summary = x->>'summary' AND e.provenance = x->>'provenance'
          WHERE r.id = $1 AND lvrf_system_exercise_mark('evidence', e.id) IS NOT NULL`,
        [req.params.id, run.institution_id]);
      res.json({ ...run, errata, system_exercise: mark?.m ?? null, marked_evidence: markedEvidence });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  return router;
}
