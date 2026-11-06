import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { askFor } from '../lib/caseQuestions.js';
import { falsifierSentence } from './valueHypotheses.js';

/**
 * B3 (P6; LVRF_PLAN §19) — GET /api/value-runs/:runId/case?lens=cfo|general: the value case of one run, read from its
 * sealed payload. A read; it persists nothing (the Print control's request is its own route).
 *
 * What is NOT from the seal, each derived at read and labelled so by the page:
 *   - the lens policy in force (the CFO lens is applied at read, to the sealed score and figures);
 *   - the pack ratification threshold N, and "sourced at x of N institutions" (ruling 1: a count, never stored);
 *   - the banners' two inputs are sealed; lvrf_run_banners() reads them from the payload.
 * A run sealed before payloadVersion 5 has no cost of delay, roadmap or solutioning: the case says "not sealed in this
 * run", never fills them from today's record.
 */
const BASIS_RANK: Record<string, number> = { system_of_record: 5, published: 4, client_stated: 3, inferred: 2, assumed: 1 };
const rank = (b: string | null | undefined) => (b ? BASIS_RANK[b] ?? 0 : 0);

interface SealedEvidence { kind: string; summary: string; provenance: string | null; source_reference: string | null; supports: string; basis: string | null;
  figure_check?: { result: string; detail: string } | null; simulated?: boolean }

/** The strongest sealed basis behind one support (baseline, actual, impact basis), or null when none is sealed. */
function bestOf(evidence: SealedEvidence[], supports: string): SealedEvidence | null {
  const items = evidence.filter((e) => e.supports === supports);
  return items.sort((a, b) => rank(b.basis) - rank(a.basis))[0] ?? null;
}

/**
 * Floor-first (Brad, 5 Nov 2026): an outcome's floor is the weakest basis among the figures it rests on; the case lists
 * the strongest floor first, so it never leads with its weakest evidence. Ties keep their sealed order.
 */
export function floorFirst<T extends { floor: string | null }>(rows: T[]): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(b.r.floor) - rank(a.r.floor) || a.i - b.i).map((x) => x.r);
}

export function valueCaseRouter(pool: Pool): Router {
  const router = Router();
  router.get('/:runId/case', async (req, res) => {
    const { runId } = req.params;
    const lens = req.query.lens === 'cfo' ? 'cfo' : 'general';
    if (!isUuid(runId)) { res.status(400).json({ message: `invalid run id: ${runId}` }); return; }
    try {
      const { rows: [r] } = await pool.query(
        `SELECT r.id, r.tenant_id, r.run_number, r.locked_at, (SELECT full_name FROM persons WHERE id = r.locked_by_person_id) AS locked_by,
                r.lock_reason, r.payload_hash, r.payload, r.confidence_score::float AS score, r.confidence_band AS band,
                g.id AS engagement_id, g.name AS engagement, (g.deleted_at IS NOT NULL) AS engagement_retired,
                i.id AS institution_id, i.name AS account, i.is_tenant_self,
                lvrf_run_banners(r.id) AS banners, lvrf_system_exercise_mark('value_runs', r.id) AS system_exercise,
                (SELECT jsonb_build_object('kind', k.kind) FROM reference_example_markers k
                  WHERE k.institution_id = i.id AND k.deleted_at IS NULL AND k.superseded_by_id IS NULL) AS marker_now
           FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
          WHERE r.id = $1 AND r.deleted_at IS NULL`, [runId]);
      if (!r || isOtherTenant(req, r.tenant_id, { table: 'value_runs', id: runId })) { res.status(404).json({ message: `run ${runId} not found` }); return; }
      const p = r.payload as Record<string, any>;
      const version: number = Number(p.payloadVersion ?? 1);
      const sealedCase = (p.case ?? null) as Record<string, any> | null;
      const evidence = (Array.isArray(p.evidence) ? p.evidence : []) as SealedEvidence[];
      const metric: string = p.businessMetric?.name ?? (typeof p.businessMetric === 'string' ? p.businessMetric : 'the metric');
      const unit: string | null = p.businessMetric?.unit ?? null;

      // Ruling 1: each pack entry shows as it stands, "proposed, sourced at x of N institutions", N a policy value.
      let packEntry = null;
      if (sealedCase?.pack_entry) {
        const { rows: [c] } = await pool.query<{ n: string | null; x: number }>(
          `SELECT trim_scale(lvrf_policy_value($1, 'pack_ratification_institutions'))::text AS n,
                  (SELECT count(DISTINCT vo.institution_id)::int FROM value_outcomes vo
                     JOIN business_metrics bm ON bm.id = vo.business_metric_id
                     JOIN institutions i ON i.id = vo.institution_id
                     JOIN value_outcome_evidence voe ON voe.value_outcome_id = vo.id AND voe.withdrawn_at IS NULL AND voe.supports IN ('baseline', 'actual')
                     JOIN evidence e ON e.id = voe.evidence_id
                    WHERE bm.industry_measure_id = $2 AND NOT i.is_tenant_self AND vo.deleted_at IS NULL
                      AND NOT EXISTS (SELECT 1 FROM reference_example_markers k WHERE k.institution_id = i.id AND k.deleted_at IS NULL AND k.superseded_by_id IS NULL)
                      AND lvrf_evidence_basis(e) = 'system_of_record') AS x`, [r.tenant_id, sealedCase.pack_entry.id]);
        packEntry = { ...sealedCase.pack_entry, sourced_at: c.x, threshold: c.n === null ? null : Number(c.n) };
      }

      const marker = sealedCase?.marker ?? r.marker_now ?? null;
      const baseline = bestOf(evidence, 'baseline');
      const actual = bestOf(evidence, 'actual');
      const impact = bestOf(evidence, 'impact_basis');
      const target = bestOf(evidence, 'target_commitment');
      const cod = version >= 5 ? sealedCase?.cost_of_delay ?? null : null;

      // What we need from you: from the sealed record, in spine order. The vendor's own gaps are kept apart.
      const codes: string[] = [];
      if (!baseline || baseline.basis !== 'system_of_record') codes.push('baseline_not_system_of_record');
      for (const reason of (cod?.reasons ?? []) as { code: string }[]) codes.push(reason.code);
      if (p.targetValue === null || p.targetValue === undefined) codes.push('no_commitment');
      if (p.actualValue === null || p.actualValue === undefined) codes.push('no_actual');
      // B4 (stage-10 rehearsal, item 4): a committer the record does not find customer-side is an ask of its own.
      if (p.targetValue !== null && p.targetValue !== undefined && p.people?.committer && p.people.committer.customer_side === false) codes.push('committer_not_customer_side');
      if (!p.people?.verifier) codes.push('no_verifier');
      const ours = new Set(['no_months', 'no_lens']);
      const unique = [...new Set(codes)];
      const asks = unique.filter((c) => !ours.has(c)).map((c) => askFor(c, r.account, metric));
      const vendorGaps = unique.filter((c) => ours.has(c)).map((c) => askFor(c, r.account, metric));

      // The CFO lens, applied at read (O3, O-D1, O-D3).
      let cfo = null;
      if (lens === 'cfo') {
        const { rows: [policy] } = await pool.query(
          `SELECT l.id, trim_scale(l.min_confidence_score)::float AS min, l.admitted_bases, l.suppresses, l.refusal_text,
                  p.full_name AS ratified_by, to_char(l.ratified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS ratified_on
             FROM lens_policies l JOIN persons p ON p.id = l.ratified_by_person_id
            WHERE l.tenant_id = $1 AND l.persona = 'cfo' AND NOT EXISTS (SELECT 1 FROM lens_policies s WHERE s.supersedes_id = l.id)`, [r.tenant_id]);
        const reasons: string[] = [];
        if (!policy) reasons.push('no_lens');
        if (marker) reasons.push('reference_example');
        if (policy && r.score < policy.min) reasons.push('below_threshold');
        if (p.actualValue === null || p.actualValue === undefined) reasons.push('no_actual');
        else if (policy && !(actual && (policy.admitted_bases as string[]).includes(actual.basis ?? ''))) reasons.push('actual_basis_not_admitted');
        cfo = {
          policy: policy ?? null,
          refused: reasons.length > 0,
          reasons: reasons.map((c) => askFor(c, r.account, metric)),
          reference_example: Boolean(marker),
        };
      }

      const outcomeFloor = [baseline?.basis ?? null, ...(p.actualValue !== null && p.actualValue !== undefined ? [actual?.basis ?? null] : [])]
        .sort((a, b) => rank(a) - rank(b))[0] ?? null;
      const outcomes = floorFirst([{
        value_outcome_id: p.valueOutcomeId ?? null, metric, unit, direction: p.businessMetric?.direction ?? null,
        baseline: p.baselineValue ?? null, target: p.targetValue ?? null, actual: p.actualValue ?? null, realization: p.realization ?? null,
        claimed_currency_impact: p.claimedCurrencyImpact ?? null, realized_currency_impact: p.realizedCurrencyImpact ?? null, currency: p.currencyCode ?? null,
        committer: p.people?.committer?.name ?? null, committer_customer_side: p.people?.committer?.customer_side ?? null,
        committer_side_reason: p.people?.committer?.reason ?? null, verifier: p.people?.verifier?.name ?? null,
        sources: { baseline, actual, impact_basis: impact, target_commitment: target }, floor: outcomeFloor,
        // B4 (§14): the method and class as sealed (v5 runs produced after B4); null before.
        attribution: sealedCase?.attribution ?? null,
      }]);

      res.json({
        run: { id: r.id, run_number: r.run_number, locked_at: r.locked_at, locked_by: r.locked_by, lock_reason: r.lock_reason,
               payload_hash: r.payload_hash, payload_version: version, score: r.score, band: r.band, system_exercise: r.system_exercise },
        engagement: { id: r.engagement_id, name: r.engagement, retired: r.engagement_retired },
        account: { id: r.institution_id, name: r.account, is_tenant_self: r.is_tenant_self },
        lens, banners: r.banners, marker,
        case_sealed: Boolean(sealedCase), v5: version >= 5,
        // B4 (stage-10 rehearsal, item 3): the falsifier in the POV's sentence, so it says which way.
        hypotheses: ((sealedCase?.hypotheses ?? []) as Record<string, any>[]).map((h) => ({ ...h,
          falsifier_text: h.falsifier?.value ? falsifierSentence({ metric_name: metric, unit, direction: (p.businessMetric?.direction ?? 'decrease') as 'increase' | 'decrease',
            falsifier_reference: h.falsifier.reference, reference_value: String(h.falsifier.value), reference_recorded_on: h.falsifier.recorded_on ?? '',
            falsifier_due: h.falsifier.due ?? '', falsifier_conditions: h.falsifier.conditions ?? '' }) : null })),
        summaries: sealedCase?.summaries ?? [],
        pack_entry: packEntry,
        outcomes,
        cost_of_delay: cod,
        roadmap: version >= 5 ? sealedCase?.roadmap ?? null : null,
        solutioning: version >= 5 ? sealedCase?.solutioning ?? [] : null,
        asks, vendor_gaps: vendorGaps,
        cfo,
      });
    } catch (err) { respondServerError(res, err); }
  });
  return router;
}
