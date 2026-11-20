import { Router } from 'express';
import type { Pool } from 'pg';
import { actorTenantId } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { computeCohortView } from './cohort.js';

/**
 * S6 (3.1; LVRF_PLAN §25; design §4.3, §5.8): GET /api/book, the War Room's read. Read-only, tenant-scoped by the
 * actor, recomputed on every request, persisting nothing.
 *
 * NO MONEY, ANYWHERE IN THIS RESPONSE (D1, Brad 20 Nov 2026). CVAF's War Room manufactured a portfolio value by
 * summing across accounts; this route carries no figure in money at all, not even one account's own: no currency, no
 * amount, no rate, no impact. A row's cost of delay is its STATE ("stated" or "refused", with the refusal's reasons),
 * and the figure stays in its own value case, with its basis. Counts and dates only.
 *
 * MEMBERSHIP IS BOOK CONFIDENCE'S, NOT A COPY OF IT: the members are the accounts of computeCohortView's book (live
 * customer accounts; not the tenant's own, not a reference example). The book's confidence is that view's composite:
 * the weakest member, never an average.
 *
 * What it does NOT carry: a row's run, its score or its next step. The War Room reads those through the account
 * frame's own derivation (client/src/lib/accountFrame.ts), so the frame and the War Room never say two things about
 * one account (S5's rule).
 */

export const CONFIRMATION_GAP_MIN = 5;
export const CONFIRMATION_GAP_DISPERSION_MIN = 12;

const CONFIRMED = new Set(['survived', 'survived_post_hoc']);
const REFUTED = new Set(['refuted', 'refuted_post_hoc']);

interface HypRow { institution_id: string; verdict: string; due_in: number }
interface OutcomeRow { id: string; institution_id: string; realization: string; promised_on: string | null; measured_on: string | null; late: boolean }
interface DelayRow { institution_id: string; run_id: string; status: string | null; reasons: string[] | null }
interface OutsideRow { id: string; name: string; self: boolean; marker_kind: string | null }

export function bookRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const tenantId = actorTenantId(req);
      const cohort = await computeCohortView(pool, tenantId);
      const memberIds = [...new Set(cohort.book.members.map((m) => m.institution_id))];

      // Hypotheses on the members' current outcomes, in current engagements, with the database's own verdict.
      const { rows: hyps } = await pool.query<HypRow>(
        `SELECT h.institution_id, lvrf_hypothesis_verdict(h) AS verdict,
                (h.falsifier_due - (now() AT TIME ZONE 'UTC')::date)::int AS due_in
           FROM value_hypotheses h
           JOIN value_outcomes o ON o.id = h.value_outcome_id AND o.deleted_at IS NULL AND o.superseded_by_id IS NULL
           JOIN engagements e ON e.id = o.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
          WHERE h.institution_id = ANY($1::uuid[]) AND h.deleted_at IS NULL AND h.superseded_by_id IS NULL`,
        [memberIds],
      );
      // Outcomes: dates and states only, never a value. Late: a promised date has passed and no actual is measured.
      const { rows: outcomes } = await pool.query<OutcomeRow>(
        `SELECT o.id, o.institution_id, o.realization::text AS realization,
                to_char(o.promised_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS promised_on,
                to_char(o.actual_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS measured_on,
                (o.promised_measured_at IS NOT NULL AND o.promised_measured_at < now() AND o.actual_measured_at IS NULL) AS late
           FROM value_outcomes o
           JOIN engagements e ON e.id = o.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
          WHERE o.institution_id = ANY($1::uuid[]) AND o.deleted_at IS NULL AND o.superseded_by_id IS NULL
          ORDER BY o.created_at`,
        [memberIds],
      );
      // Cost of delay, per locked run that is not a system exercise: its STATE and reasons only (D1, D3). The amount,
      // the rate and the currency in the sealed case are never selected.
      const { rows: delays } = await pool.query<DelayRow>(
        `SELECT e.institution_id, r.id AS run_id,
                CASE WHEN coalesce((r.payload->>'payloadVersion')::int, 1) >= 5 THEN r.payload->'case'->'cost_of_delay'->>'status' END AS status,
                CASE WHEN coalesce((r.payload->>'payloadVersion')::int, 1) >= 5
                     THEN (SELECT array_agg(x->>'text' ORDER BY ord) FROM jsonb_array_elements(r.payload->'case'->'cost_of_delay'->'reasons') WITH ORDINALITY AS t(x, ord)) END AS reasons
           FROM value_runs r
           JOIN engagements e ON e.id = r.engagement_id
          WHERE e.institution_id = ANY($1::uuid[]) AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL
            AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL`,
        [memberIds],
      );
      // Not in the book (D2): the tenant's own account and each reference example, with its reason. Never counted.
      const { rows: outside } = await pool.query<OutsideRow>(
        `SELECT i.id, i.name, i.is_tenant_self AS self,
                (SELECT m.kind::text FROM reference_example_markers m
                  WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL
                  ORDER BY m.created_at DESC LIMIT 1) AS marker_kind
           FROM institutions i
          WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL
            AND (i.is_tenant_self OR EXISTS (SELECT 1 FROM reference_example_markers m
                  WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL))
          ORDER BY i.is_tenant_self, i.name`,
        [tenantId],
      );

      const window = (d: number) => (d >= 0 && d <= 30 ? 30 : d > 30 && d <= 60 ? 60 : d > 60 && d <= 90 ? 90 : null);
      const tally = (hs: HypRow[]) => {
        const open = hs.filter((h) => h.verdict === 'open');
        return {
          due: { in30: open.filter((h) => window(h.due_in) === 30).length, in60: open.filter((h) => window(h.due_in) === 60).length, in90: open.filter((h) => window(h.due_in) === 90).length },
          past_due_open: open.filter((h) => h.due_in < 0).length,
          open: open.length,
          confirmed: hs.filter((h) => CONFIRMED.has(h.verdict)).length,
          refuted: hs.filter((h) => REFUTED.has(h.verdict)).length,
        };
      };
      const outcomeTally = (os: OutcomeRow[]) => ({
        total: os.length,
        late: os.filter((o) => o.late).length,
        // "No promised date on record": not measured, and no date was promised. Never read as on time (D5).
        no_promised_date: os.filter((o) => o.promised_on === null && o.measured_on === null).length,
        by_status: os.reduce<Record<string, number>>((a, o) => ({ ...a, [o.realization]: (a[o.realization] ?? 0) + 1 }), {}),
      });

      const accounts = memberIds.map((id) => {
        const os = outcomes.filter((o) => o.institution_id === id);
        return {
          institution_id: id,
          hypotheses: tally(hyps.filter((h) => h.institution_id === id)),
          outcomes: { ...outcomeTally(os), list: os.map((o) => ({ id: o.id, realization: o.realization, promised_on: o.promised_on, measured_on: o.measured_on, late: o.late })) },
          cost_of_delay_by_run: delays.filter((d) => d.institution_id === id)
            .map((d) => ({ run_id: d.run_id, state: d.status === 'stated' ? 'stated' : d.status === 'refused' ? 'refused' : 'not_sealed', reasons: d.status === 'refused' ? d.reasons ?? [] : [] })),
        };
      });

      // The confirmation gap (D4): its admissible count and its refusal only. Admissible = verified (a measured but
      // unverified result earns no credit; records/confirmation_gap.py, 29 July).
      const admissible = outcomes.filter((o) => o.realization === 'verified').length;

      res.json({
        as_of: new Date().toISOString().slice(0, 10),
        book: {
          account_count: memberIds.length,
          confidence: cohort.book.composite,
          hypotheses: tally(hyps),
          outcomes: outcomeTally(outcomes),
          confirmation_gap: {
            admissible,
            needs: CONFIRMATION_GAP_MIN,
            reported: false,
            dispersion_needs: CONFIRMATION_GAP_DISPERSION_MIN,
          },
        },
        accounts,
        by_industry: cohort.by_industry,
        cohort_members: cohort.book.members,
        not_in_book: outside.map((o) => ({ institution_id: o.id, name: o.name, reason: o.self ? 'own_account' : 'reference_example', marker_kind: o.marker_kind })),
      });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  return router;
}
