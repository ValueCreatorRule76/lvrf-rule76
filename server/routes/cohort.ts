import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { actorTenantId } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * 2.0 item 3 — cohort roll-up, weakest link. GET /api/cohort.
 *
 * WHAT A COHORT IS HERE. A set of the actor's tenant's CUSTOMER accounts:
 * the whole book, and each industry's accounts (the classification act's
 * industry_id). The tenant's own account (is_tenant_self) is excluded —
 * ranking the vendor's measurement of itself against its customers would
 * blend two different questions. "Cohort" also means "several outcomes in
 * one engagement" elsewhere in BUILD_STATUS (the 1.2 payload note); that is
 * NOT what this computes — a run still holds exactly one outcome.
 *
 * WEAKEST LINK, NEVER AN AVERAGE. The composite is the MINIMUM across the
 * cohort's members. There is deliberately no mean, median or weighted sum
 * anywhere in this file: averaging launders the gaps — one account at 10
 * and three at 80 average to a respectable 62 that describes no account.
 *
 * UNMEASURED IS NOT COMPLIANT, AND IT IS EMPTY, NOT 0. A member is one
 * current engagement. Its score is its latest LOCKED run's
 * confidence_score. A member with no run of record has NO score, with the
 * reason stated:
 *   no_engagement   the account has no current engagement at all
 *   never_run       the engagement has never been walked
 *   no_locked_run   it has runs, but none is locked — a mutable snapshot is
 *                   not a record (compareRuns refuses unlocked runs for the
 *                   same reason), so it does not stand in for one
 * Its confidence_score is null, never 0. CLAUDE.md: a number that cannot
 * be sourced stays empty, and the record says so. An unmeasured member
 * still sets the floor, because it sorts first, but when it does the
 * composite's score is null and `floor: 'unmeasured'` says why. It is not
 * a number nobody measured.
 *
 * An unmeasured floor has NO BAND either. This file does not restate the
 * model's band thresholds (they live in confidenceModel.ts's
 * CONFIDENCE_BANDS and are part of the fingerprint); a run's band is read
 * from the run, and a member with no run has none.
 *
 * composite.lowest_recorded is CONTEXT ONLY, NEVER THE COHORT'S SCORE. It is
 * the lowest run of record among measured members, so a reader of an
 * unmeasured floor can still see what was recorded. It is not a minimum
 * across the cohort, and it must never be shown as one.
 *
 * MODEL VERSIONS QUALIFY, THEY DO NOT REFUSE — same posture as
 * compareRuns.ts. A minimum taken across runs scored by different model
 * fingerprints, or by runs that predate versioning (no fingerprint, and
 * never back-filled), is still the honest minimum of what was recorded,
 * but the scores are not on one ruler. `model.comparable` is true only
 * when every contributing run carries the same fingerprint.
 *
 * A CURRENT VIEW, NOT PART OF THE RECORD. Same as the gap register: it
 * recomputes from live rows on every request, persists nothing, and has no
 * write path. It reads stored run scores; it never recomputes confidence.
 *
 * Tenant-scoped by the actor: actorTenantId (lib/tenantScope.ts, sign-in
 * P3), which replaced this file's local copy of resolveActorTenantId.
 */


type MemberStatus = 'run_of_record' | 'no_locked_run' | 'never_run' | 'no_engagement';

interface Row {
  institution_id: string;
  institution_name: string;
  industry_slug: string | null;
  industry_name: string | null;
  engagement_id: string | null;
  engagement_name: string | null;
  run_id: string | null;
  run_number: number | null;
  confidence_score: string | null;
  confidence_band: string | null;
  locked_at: string | null;
  model_version: string | null;
  model_fingerprint: string | null;
  run_count: number | null;
  erratum_line: string | null;
}

export interface CohortMember {
  institution_id: string;
  institution_name: string;
  engagement_id: string | null;
  engagement_name: string | null;
  status: MemberStatus;
  /**
   * INTERNAL ORDERING KEY, NEVER A SCORE. It is 0 for an unmeasured
   * member, so it sorts first and sets the floor, and the stored score
   * otherwise. It exists only so `members` can be sorted weakest first. A
   * reader wanting this member's score reads confidence_score, which is
   * null when there is none.
   */
  sort_key: number;
  run_id: string | null;
  run_number: number | null;
  /** As stored on the run (pg numeric, a string). Null unless run_of_record. */
  confidence_score: string | null;
  confidence_band: string | null;
  locked_at: string | null;
  model_version: string | null;
  model_fingerprint: string | null;
  /** All runs for this engagement, locked or not — context for no_locked_run. */
  run_count: number;
  /** C3 (Brad's condition): the run of record's current errata, in a line, shown beside its score; null if none. */
  erratum_line: string | null;
}

export interface Cohort {
  account_count: number;
  member_count: number;
  measured_count: number;
  composite: {
    /**
     * The floor run's confidence_score, as stored (pg numeric, a string).
     * Null when the floor is unmeasured or the cohort is empty — never 0
     * standing in for a number nobody measured.
     */
    score: string | null;
    band: string | null;
    floor: 'run' | 'unmeasured' | 'empty';
    determined_by: CohortMember | null;
    /**
     * CONTEXT ONLY, NEVER THE COHORT'S SCORE. The lowest run of record
     * among measured members, or null if no member has one. When the floor
     * is unmeasured, this is what was recorded, not what the cohort scores.
     */
    lowest_recorded: {
      confidence_score: string;
      confidence_band: string | null;
      member: CohortMember;
    } | null;
  };
  /** Weakest first. */
  members: CohortMember[];
  model: {
    fingerprints: { model_version: string | null; model_fingerprint: string | null; run_count: number }[];
    comparable: boolean;
    note: string;
  };
}

const STATUS_ORDER: Record<MemberStatus, number> = {
  no_engagement: 0,
  never_run: 1,
  no_locked_run: 2,
  run_of_record: 3,
};

function toMember(r: Row): CohortMember {
  let status: MemberStatus;
  if (r.engagement_id === null) status = 'no_engagement';
  else if (r.run_id !== null) status = 'run_of_record';
  else if ((r.run_count ?? 0) > 0) status = 'no_locked_run';
  else status = 'never_run';
  const recorded = status === 'run_of_record';
  return {
    institution_id: r.institution_id,
    institution_name: r.institution_name,
    engagement_id: r.engagement_id,
    engagement_name: r.engagement_name,
    status,
    // Ordering only. 0 puts an unmeasured member first; it is never
    // reported as this member's score. confidence_score below stays null.
    sort_key: recorded ? Number(r.confidence_score) : 0,
    run_id: recorded ? r.run_id : null,
    run_number: recorded ? r.run_number : null,
    confidence_score: recorded ? r.confidence_score : null,
    confidence_band: recorded ? r.confidence_band : null,
    locked_at: recorded ? r.locked_at : null,
    model_version: recorded ? r.model_version : null,
    model_fingerprint: recorded ? r.model_fingerprint : null,
    run_count: r.run_count ?? 0,
    erratum_line: recorded ? r.erratum_line : null,
  };
}

export function buildCohort(rows: Row[]): Cohort {
  const members = rows.map(toMember).sort((a, b) =>
    a.sort_key - b.sort_key
    // A recorded score of 0 ties with an unmeasured member's sort key; the
    // unmeasured one sorts first, so it sets the floor and the composite
    // score is null rather than that run's 0.
    || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || a.institution_name.localeCompare(b.institution_name)
    || (a.engagement_name ?? '').localeCompare(b.engagement_name ?? ''),
  );
  const accountIds = new Set(rows.map((r) => r.institution_id));
  const recorded = members.filter((m) => m.status === 'run_of_record');

  // members is sorted weakest first and filter keeps that order, so the
  // first recorded member holds the lowest stored score.
  const lowest = recorded[0] ?? null;
  const lowestRecorded: Cohort['composite']['lowest_recorded'] = lowest === null
    ? null
    : { confidence_score: lowest.confidence_score!, confidence_band: lowest.confidence_band, member: lowest };

  const weakest = members[0] ?? null;
  let composite: Cohort['composite'];
  if (weakest === null) {
    composite = { score: null, band: null, floor: 'empty', determined_by: null, lowest_recorded: null };
  } else if (weakest.status === 'run_of_record') {
    composite = {
      score: weakest.confidence_score,
      band: weakest.confidence_band,
      floor: 'run',
      determined_by: weakest,
      lowest_recorded: lowestRecorded,
    };
  } else {
    composite = {
      score: null,
      band: null,
      floor: 'unmeasured',
      determined_by: weakest,
      lowest_recorded: lowestRecorded,
    };
  }

  const byFingerprint = new Map<string, { model_version: string | null; model_fingerprint: string | null; run_count: number }>();
  for (const m of recorded) {
    const key = `${m.model_fingerprint ?? '∅'}|${m.model_version ?? '∅'}`;
    const entry = byFingerprint.get(key) ?? { model_version: m.model_version, model_fingerprint: m.model_fingerprint, run_count: 0 };
    entry.run_count += 1;
    byFingerprint.set(key, entry);
  }
  const fingerprints = [...byFingerprint.values()];
  const unversioned = recorded.filter((m) => m.model_fingerprint === null).length;
  let comparable: boolean;
  let note: string;
  if (recorded.length === 0) {
    comparable = true;
    note = 'No runs of record contribute, so there is no score to compare.';
  } else if (unversioned > 0) {
    comparable = false;
    note = `${unversioned} contributing run(s) predate model versioning and carry no fingerprint; the minimum is honest, but those scores cannot be shown to share a ruler with the rest.`;
  } else if (fingerprints.length > 1) {
    comparable = false;
    note = `Contributing runs were scored by ${fingerprints.length} different model fingerprints; the minimum is taken across rulers that differ.`;
  } else {
    comparable = true;
    note = 'Every contributing run was scored by the same model.';
  }

  return {
    account_count: accountIds.size,
    member_count: members.length,
    measured_count: recorded.length,
    composite,
    members,
    model: { fingerprints, comparable, note },
  };
}

export function cohortRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const tenantId = actorTenantId(req);

      // One row per (customer account, current engagement), or one row
      // with engagement_id NULL for an account with none. The run of
      // record is the highest-numbered LOCKED run per engagement.
      const { rows } = await pool.query<Row>(
        `WITH run_of_record AS (
           SELECT DISTINCT ON (engagement_id)
                  id, engagement_id, run_number, confidence_score, confidence_band,
                  locked_at,
                  payload->'confidence'->>'modelVersion'     AS model_version,
                  payload->'confidence'->>'modelFingerprint' AS model_fingerprint,
                  lvrf_run_erratum_line(id) AS erratum_line
             FROM value_runs
            WHERE deleted_at IS NULL AND locked_at IS NOT NULL
              -- C3 (ruling E): a run marked as a system exercise is never the run of record.
              AND lvrf_system_exercise_mark('value_runs', id) IS NULL
            ORDER BY engagement_id, run_number DESC
         ),
         run_counts AS (
           SELECT engagement_id, count(*)::int AS run_count
             FROM value_runs
            WHERE deleted_at IS NULL
            GROUP BY engagement_id
         )
         SELECT i.id AS institution_id, i.name AS institution_name,
                ind.slug AS industry_slug, ind.name AS industry_name,
                e.id AS engagement_id, e.name AS engagement_name,
                r.id AS run_id, r.run_number, r.confidence_score, r.confidence_band,
                r.locked_at, r.model_version, r.model_fingerprint,
                rc.run_count, r.erratum_line
           FROM institutions i
           LEFT JOIN industries ind ON ind.id = i.industry_id
           LEFT JOIN engagements e
                  ON e.institution_id = i.id
                 AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
           LEFT JOIN run_of_record r ON r.engagement_id = e.id
           LEFT JOIN run_counts rc ON rc.engagement_id = e.id
          WHERE i.tenant_id = $1
            AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL
            AND i.is_tenant_self = false
            -- Q4n (O-D3): a reference example is not a customer engagement. An
            -- account with a CURRENT marker is left out of the book and every
            -- industry cohort; unmarking it (the steward's act) counts it again.
            AND NOT EXISTS (SELECT 1 FROM reference_example_markers m
                             WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)
          ORDER BY i.name, e.name`,
        [tenantId],
      );
      // How many accounts the book leaves out as reference examples, so an
      // empty book can say why ("No live customer engagements").
      const { rows: [{ n: referenceExampleCount }] } = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM institutions i
          WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL AND i.is_tenant_self = false
            AND EXISTS (SELECT 1 FROM reference_example_markers m
                         WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)`,
        [tenantId],
      );

      const industries = new Map<string, { slug: string; name: string; rows: Row[] }>();
      const unclassified = new Set<string>();
      for (const r of rows) {
        if (r.industry_slug === null || r.industry_name === null) {
          unclassified.add(r.institution_id);
          continue;
        }
        const entry = industries.get(r.industry_slug) ?? { slug: r.industry_slug, name: r.industry_name, rows: [] };
        entry.rows.push(r);
        industries.set(r.industry_slug, entry);
      }

      res.json({
        book: buildCohort(rows),
        by_industry: [...industries.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((ind) => ({
            industry: { slug: ind.slug, name: ind.name },
            cohort: buildCohort(ind.rows),
          })),
        // Unclassified accounts are in the book but in no industry cohort —
        // counted here so their absence from by_industry is visible.
        unclassified_account_count: unclassified.size,
        reference_example_count: referenceExampleCount,
      });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  return router;
}
