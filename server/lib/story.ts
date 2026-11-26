import type { PoolClient, Pool } from 'pg';
import { FIGURE_CLASSES } from './figureClass.js';
import { sealedAsks } from './sealedAsks.js';

/**
 * S7b (3.1; LVRF_PLAN §27; Brad's rulings 24-25 Nov 2026): the story of record, composed. One function, read by the
 * draft (on screen only, marked DRAFT) and by issuing (sealed into story_records, the hash the database's). Everything
 * the story prints is in the payload it returns, so an issued story re-renders from its row alone, byte for byte.
 *
 * What it reads (D1):
 *   - every LOCKED run of the account that is not a system exercise (Brad: real runs only), retired engagements included
 *     and labelled so; each run's sealed score and band, as sealed, never recomputed;
 *   - each run's CURRENT errata (never a superseded one), in the platform's wording for its kind, lvrf_erratum_line()
 *     (ruling (c): never the erratum's recorded text), in lvrf_run_erratum_line's order;
 *   - the account's figure findings, in the platform's wording (the field, the value and the unit), never the finding's text;
 *   - the current head of each evidence row it cites: the account's current rows with a published figure's class (D5), each
 *     with the class's ruled lines (server/lib/figureClass.ts), its basis and its open state;
 *   - each engagement's latest real run's asks (sealedAsks, the value case's own definition; D8).
 *
 * The stage (D2, D3): a reference example is 'reference', never Decision; otherwise 'compounding' when two sealed real runs
 * are verified (realization 'verified', the banners' rule) on different sealed actual evidence rows, neither superseding
 * the other (Brad, 25 Nov 2026); 'realization' when one is; 'decision' when a real run is locked. With no locked real run there is nothing to tell (null).
 *
 * It writes nothing.
 */

export type StoryStage = 'reference' | 'decision' | 'realization' | 'compounding';
export type StoryAudience = 'internal' | 'client';
/** Version 2 (S7b.1, Brad 25 Nov 2026): each finding seals its engagement; the ledger is numbered in reading order;
 *  the preparer is "Rule 76 Consulting LLC for {tenant}", with the tenant sealed on its own. Version 1 stays readable. */
export const STORY_VERSION = 2;
/** The firm that prepares a story (S7b.1, R3). One constant, cited here only. */
export const STORY_PREPARER = 'Rule 76 Consulting LLC';

type Q = Pick<PoolClient, 'query'> | Pick<Pool, 'query'>;

export interface StoryErratum { id: string; kind: string; line: string; recorded_on: string; group: string }
export interface StoryRun {
  id: string; run_number: number; locked_on: string; score: number; band: string; payload_hash: string;
  realization: string | null; errata: StoryErratum[];
}
export interface StoryEngagement {
  id: string; name: string; retired: boolean; runs: StoryRun[]; latest_run_id: string;
  metric: { name: string; unit: string | null; baseline: number | null };
  /** From the latest real run's seal only; null when it seals no commitment. */
  commitment: { target: number; committer: string | null; committer_customer_side: boolean | null; measured_by: string | null;
                attribution: { method: string | null; class: string | null } | null } | null;
  /** The latest VERIFIED real run's sealed actual (D2: only at Realization and above); null below. */
  result: { run_id: string; actual: number; realization: string } | null;
  asks: { code: string; need: string; question: string }[];
}
export interface StoryFinding { id: string; outcome_id: string; /** v2: the engagement that owns the outcome. */ engagement_id?: string; field: string; value: string; line: string; recorded_on: string }
export interface StoryPublished {
  id: string; kind: string; class: string; class_label: string; can: string; cannot: string; basis: string;
  form: string; quote: string | null; locator: unknown; how_read: string | null; summary: string; source_reference: string | null;
  open_state: 'verified' | 'not_supported' | 'unopened';
}
export interface LedgerEntry { n: number; figure: string; source: string; ids: string[]; full_hash?: string }
export interface StoryPayload {
  storyVersion: number; audience: StoryAudience; stage: StoryStage;
  account: { id: string; name: string }; prepared_by: string;
  /** v2: the tenant's name, on its own (the cover's "for {tenant}'s people"). */
  tenant?: string;
  marker: { kind: string; note: string | null } | null;
  title: string; subtitle: string | null;
  /** Rule 6, on every page: outside-in when every real run is (lvrf_run_banners); unverified when none holds a verified actual. */
  banners: { outside_in: boolean; unverified: boolean };
  engagements: StoryEngagement[];
  headline: { engagement_id: string; run_id: string }[];
  findings: StoryFinding[];
  published: StoryPublished[];
  evidence_heads: string[];
  ledger: LedgerEntry[];
  refs: Record<string, number>;
}

const FIELD_WORD: Record<string, string> = { baseline_value: 'baseline', actual_value: 'actual', claimed_currency_impact: 'claimed currency impact' };
const trimNum = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
/** A figure with its unit: "214 days", "95.3%". */
export const withUnit = (v: string | number, unit: string | null) => (unit ? (unit === '%' ? `${v}%` : `${v} ${unit}`) : `${v}`);

/** The cover title follows the stage, never claiming beyond it (Brad, 25 Nov 2026, mock-up change 1). */
export function storyTitle(stage: StoryStage): string {
  if (stage === 'reference') return 'Story of record';
  if (stage === 'decision') return 'Story of record: decision';
  return 'Success story';
}

export class StoryRefusal extends Error {}

export async function composeStory(db: Q, tenantId: string, institutionId: string, audience: StoryAudience): Promise<StoryPayload | null> {
  const { rows: [acct] } = await db.query<{ id: string; name: string; vendor: string; marker_kind: string | null; marker_note: string | null }>(
    `SELECT i.id, i.name, t.name AS vendor, k.kind AS marker_kind, k.note AS marker_note
       FROM institutions i JOIN tenants t ON t.id = i.tenant_id
       LEFT JOIN reference_example_markers k ON k.institution_id = i.id AND k.deleted_at IS NULL AND k.superseded_by_id IS NULL
      WHERE i.id = $1 AND i.tenant_id = $2 AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL`, [institutionId, tenantId]);
  if (!acct) return null;
  const marker = acct.marker_kind ? { kind: acct.marker_kind, note: acct.marker_note } : null;
  // D4: a reference example renders for the internal audience only.
  if (marker && audience !== 'internal') throw new StoryRefusal("A reference example's story is for your company's people only; it has no client copy.");

  const { rows: runs } = await db.query<{
    id: string; engagement_id: string; engagement: string; retired: boolean; run_number: number; locked_at: Date;
    score: number; band: string; payload_hash: string; payload: Record<string, any>; banners: { outside_in: boolean; unverified: boolean };
  }>(
    `SELECT r.id, lvrf_run_banners(r.id) AS banners, g.id AS engagement_id, g.name AS engagement, (g.deleted_at IS NOT NULL OR g.status::text = 'retired') AS retired,
            r.run_number, r.locked_at, r.confidence_score::float AS score, r.confidence_band::text AS band, r.payload_hash, r.payload
       FROM value_runs r JOIN engagements g ON g.id = r.engagement_id
      WHERE g.institution_id = $1 AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL
        AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL
      ORDER BY g.created_at, g.id, r.run_number`, [institutionId]);
  if (runs.length === 0) return null;

  const { rows: errata } = await db.query<{ id: string; value_run_id: string; kind: string; line: string; recorded_at: Date; finding_code: string | null; figure_finding_id: string | null }>(
    `SELECT x.id, x.value_run_id, x.kind::text, lvrf_erratum_line(x.id) AS line, x.recorded_at, x.finding_code, x.figure_finding_id
       FROM run_errata x
      WHERE x.value_run_id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)
      ORDER BY x.recorded_at, x.kind, x.id`, [runs.map((r) => r.id)]);

  const { rows: findingRows } = await db.query<{ id: string; value_outcome_id: string; engagement_id: string; field: string; value: string; unit: string | null; recorded_at: Date }>(
    `SELECT f.id, f.value_outcome_id, vo.engagement_id, f.field::text, trim_scale(f.value)::text AS value, bm.unit, f.recorded_at
       FROM figure_findings f JOIN value_outcomes vo ON vo.id = f.value_outcome_id
       LEFT JOIN business_metrics bm ON bm.id = vo.business_metric_id
      WHERE f.institution_id = $1 ORDER BY f.recorded_at, f.id`, [institutionId]);

  const { rows: pubRows } = await db.query<{
    id: string; kind: string; published_figure_class: string; basis: string; evidence_form: string; quote_text: string | null;
    locator: unknown; how_read: string | null; summary: string; source_reference: string | null; citation_resolved: boolean; source_verified: boolean;
  }>(
    `SELECT e.id, e.kind::text, e.published_figure_class, lvrf_evidence_basis(e) AS basis, e.evidence_form::text, e.quote_text, e.locator,
            e.how_read, e.summary, e.source_reference, e.citation_resolved, e.source_verified
       FROM evidence e
      WHERE e.institution_id = $1 AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL AND e.published_figure_class IS NOT NULL
      ORDER BY array_position(ARRAY['license_count', 'activity_count', 'adjective', 'outcome_without_baseline', 'outcome_with_baseline'], e.published_figure_class),
               -- each row's first recording: the earliest row whose supersession chain reaches it
               coalesce((SELECT min(p.created_at) FROM evidence p WHERE p.institution_id = e.institution_id AND e.id IN (SELECT lvrf_evidence_chain(p.id))), e.created_at),
               e.id`, [institutionId]);

  // Errata repeated across runs print once in the ledger, naming the runs (D9): a repeat is the same printed line.
  const groupOf = (x: { line: string }) => x.line.replace(/^erratum: /, '');

  const engagements: StoryEngagement[] = [];
  for (const r of runs) {
    let g = engagements.find((e) => e.id === r.engagement_id);
    if (!g) {
      g = { id: r.engagement_id, name: r.engagement, retired: r.retired, runs: [], latest_run_id: r.id,
            metric: { name: '', unit: null, baseline: null }, commitment: null, result: null, asks: [] };
      engagements.push(g);
    }
    g.runs.push({
      id: r.id, run_number: r.run_number, locked_on: day(r.locked_at), score: Number(r.score), band: r.band, payload_hash: r.payload_hash,
      realization: r.payload.realization ?? null,
      errata: errata.filter((x) => x.value_run_id === r.id).map((x) => ({
        id: x.id, kind: x.kind, line: x.line.replace(/^erratum: /, ''), recorded_on: day(x.recorded_at), group: groupOf(x) })),
    });
  }
  for (const g of engagements) {
    const latest = runs.filter((r) => r.engagement_id === g.id).sort((a, b) => b.run_number - a.run_number)[0];
    g.latest_run_id = latest.id;
    const p = latest.payload;
    g.metric = { name: p.businessMetric?.name ?? 'the metric', unit: p.businessMetric?.unit ?? null,
                 baseline: p.baselineValue === null || p.baselineValue === undefined ? null : Number(p.baselineValue) };
    g.asks = sealedAsks(p, acct.name).asks.map((a) => ({ code: a.code, need: a.need, question: a.question }));
    // D3: a reference example never prints a commitment as the client's, so none is carried.
    g.commitment = marker || p.targetValue === null || p.targetValue === undefined ? null : {
      target: Number(p.targetValue), committer: p.people?.committer?.name ?? null, committer_customer_side: p.people?.committer?.customer_side ?? null,
      measured_by: p.case?.roadmap?.promised_measured_on ?? null, attribution: p.case?.attribution ?? null };
    const verified = runs.filter((r) => r.engagement_id === g.id && r.payload.realization === 'verified' && r.payload.actualValue !== null && r.payload.actualValue !== undefined)
      .sort((a, b) => b.run_number - a.run_number)[0];
    g.result = verified ? { run_id: verified.id, actual: Number(verified.payload.actualValue), realization: verified.payload.realization } : null;
  }

  // The stage (D2, D3; Compounding ruled by Brad, 25 Nov 2026). Two verified sealed real runs compound when their actuals
  // rest on different sealed evidence rows, neither superseding the other: a row and its correction are ONE measurement,
  // so each sealed actual row is read as the first row of its supersession chain (lvrf_evidence_chain).
  let stage: StoryStage;
  if (marker) stage = 'reference';
  else {
    const verified = runs.filter((r) => r.payload.realization === 'verified');
    const actualIds = [...new Set(verified.flatMap((r) => ((r.payload.evidence ?? []) as { supports: string; evidence_id?: string }[])
      .filter((e) => e.supports === 'actual' && typeof e.evidence_id === 'string').map((e) => e.evidence_id as string)))];
    const { rows: roots } = actualIds.length === 0 ? { rows: [] as { id: string; root: string }[] } : await db.query<{ id: string; root: string }>(
      `SELECT a.id::text, coalesce((SELECT p.id FROM evidence p
                                      WHERE a.id IN (SELECT lvrf_evidence_chain(p.id))
                                        AND NOT EXISTS (SELECT 1 FROM evidence q WHERE q.superseded_by_id = p.id)
                                      ORDER BY p.created_at, p.id LIMIT 1), a.id)::text AS root
         FROM unnest($1::uuid[]) AS a(id)`, [actualIds]);
    const rootOf = new Map(roots.map((x) => [x.id, x.root]));
    const measurements = verified.map((r) => new Set(((r.payload.evidence ?? []) as { supports: string; evidence_id?: string }[])
      .filter((e) => e.supports === 'actual' && typeof e.evidence_id === 'string').map((e) => rootOf.get(e.evidence_id as string) ?? (e.evidence_id as string))));
    // Two runs compound when one rests on a measurement the other does not.
    let compounds = false;
    for (let i = 0; i < measurements.length && !compounds; i++) {
      for (let j = i + 1; j < measurements.length && !compounds; j++) {
        const a = measurements[i], b = measurements[j];
        if (a.size > 0 && b.size > 0 && ([...a].some((x) => !b.has(x)) || [...b].some((x) => !a.has(x)))) compounds = true;
      }
    }
    stage = compounds ? 'compounding' : verified.length >= 1 ? 'realization' : 'decision';
  }

  const findings: StoryFinding[] = findingRows.map((f) => {
    const value = trimNum(f.value);
    return { id: f.id, outcome_id: f.value_outcome_id, engagement_id: f.engagement_id, field: f.field, value,
             line: `the ${FIELD_WORD[f.field] ?? f.field}, ${withUnit(value, f.unit)}, has no source on record`, recorded_on: day(f.recorded_at) };
  });

  const published: StoryPublished[] = pubRows.map((e) => {
    const c = FIGURE_CLASSES.find((x) => x.value === e.published_figure_class);
    if (!c) throw new Error(`LVRF: story: evidence ${e.id} has an unknown class ${e.published_figure_class}`);
    return {
      id: e.id, kind: e.kind, class: c.value, class_label: c.label, can: c.can, cannot: c.cannot, basis: e.basis,
      form: e.evidence_form, quote: e.quote_text, locator: e.locator ?? null, how_read: e.how_read, summary: e.summary,
      source_reference: e.source_reference,
      open_state: e.citation_resolved ? (e.source_verified ? 'verified' : 'not_supported') : 'unopened',
    };
  });

  // The ledger (D7): every figure the text prints is a numbered entry, in reading order (below).
  const ledger: LedgerEntry[] = [];
  const refs: Record<string, number> = {};
  const add = (key: string, figure: string, source: string, ids: string[], full_hash?: string) => {
    if (refs[key] !== undefined) return refs[key];
    const n = ledger.length + 1;
    ledger.push({ n, figure, source, ids, ...(full_hash ? { full_hash } : {}) });
    refs[key] = n;
    return n;
  };
  const runLabel = (g: StoryEngagement, r: StoryRun) => `run ${r.run_number} of ${g.name}${g.retired ? ' (retired)' : ''}`;
  const errataGroup = (group: string) => {
    const all = engagements.flatMap((g) => g.runs.flatMap((r) => r.errata.filter((x) => x.group === group).map((x) => ({ g, r, x }))));
    // Grouped per engagement: "runs 1, 3, 4, 5 and 13 of X (retired); run 1 of Y".
    const byEng = engagements.map((g) => ({ g, nums: [...new Set(all.filter((a) => a.g.id === g.id).map((a) => a.r.run_number))] })).filter((x) => x.nums.length > 0);
    const list = (xs: number[]) => (xs.length === 1 ? `run ${xs[0]}` : `runs ${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
    const runsNamed = byEng.map(({ g, nums }) => `${list(nums)} of ${g.name}${g.retired ? ' (retired)' : ''}`);
    const ids = [...new Set(all.map(({ x }) => x.id))];
    return { ids, source: `Errata on ${runsNamed.join('; ')}`, first: all[0]?.x.line ?? '' };
  };
  const scoreEntry = (g: StoryEngagement, r: StoryRun) =>
    add(`run:${r.id}`, `${r.score} / 100, ${r.band}`, `Sealed ${runLabel(g, r)}, its confidence`, [r.id], r.payload_hash);
  const errataEntries = (r: StoryRun) => { for (const x of r.errata) { const eg = errataGroup(x.group); add(`erratum:${x.group}`, eg.first, eg.source, eg.ids); } };
  const unitOf = new Map(findingRows.map((f) => [f.id, f.unit]));
  const findingEntry = (f: StoryFinding) =>
    add(`finding:${f.id}`, `${withUnit(f.value, unitOf.get(f.id) ?? null)}, no source on record`, `Figure finding on the outcome ${f.outcome_id.slice(0, 8)}`, [f.id]);
  // The ledger is numbered in the full form's reading order (S7b.1, D1; the page prints in this order):
  //   1. each engagement's latest score, then its errata        (the headline)
  //   2. each engagement's baseline, its target, its findings    (what they chose / what research found)
  //   3. any finding whose engagement has no locked real run     (its own block)
  //   4. the published rows
  //   5. the earlier runs, with their errata, in timeline order  (how it went)
  //   6. the verified actuals                                     (Results)
  for (const g of engagements) {
    const latest = g.runs.find((r) => r.id === g.latest_run_id)!;
    scoreEntry(g, latest);
    errataEntries(latest);
  }
  for (const g of engagements) {
    const latest = g.runs.find((r) => r.id === g.latest_run_id)!;
    if (g.metric.baseline !== null) {
      add(`baseline:${g.id}`, withUnit(g.metric.baseline, g.metric.unit), `Sealed ${runLabel(g, latest)}, the baseline field`, [latest.id], latest.payload_hash);
    }
    if (g.commitment) add(`target:${g.id}`, withUnit(g.commitment.target, g.metric.unit), `Sealed ${runLabel(g, latest)}, the target field`, [latest.id], latest.payload_hash);
    for (const f of findings.filter((x) => x.engagement_id === g.id)) findingEntry(f);
  }
  for (const f of findings.filter((x) => !engagements.some((g) => g.id === x.engagement_id))) findingEntry(f);
  for (const e of published) {
    add(`evidence:${e.id}`, e.summary, `Evidence ${e.id.slice(0, 8)} · ${e.kind.replace(/_/g, ' ')} · ${e.basis.replace(/_/g, ' ')} · ${e.form.replace(/_/g, ' ')} · ${e.open_state === 'verified' ? 'verified' : e.open_state === 'not_supported' ? 'opened; does not support it' : 'unverified'}`, [e.id]);
  }
  for (const g of engagements) {
    for (const r of g.runs) { scoreEntry(g, r); errataEntries(r); }
  }
  for (const g of engagements) {
    if (g.result) {
      const vr = g.runs.find((r) => r.id === g.result!.run_id)!;
      add(`actual:${g.id}`, withUnit(g.result.actual, g.metric.unit), `Sealed ${runLabel(g, vr)}, the actual field, verified`, [vr.id], vr.payload_hash);
    }
  }

  const title = storyTitle(stage);
  const subtitle = marker ? `A reference example, built from published sources: ${acct.name} has not engaged through LVRF` : null;

  return {
    storyVersion: STORY_VERSION, audience, stage,
    account: { id: acct.id, name: acct.name }, prepared_by: `${STORY_PREPARER} for ${acct.vendor}`, tenant: acct.vendor,
    marker, title, subtitle,
    banners: { outside_in: runs.every((r) => r.banners?.outside_in === true), unverified: !runs.some((r) => r.payload.realization === 'verified') },
    engagements,
    headline: engagements.map((g) => ({ engagement_id: g.id, run_id: g.latest_run_id })),
    findings, published,
    evidence_heads: published.map((e) => e.id),
    ledger, refs,
  };
}
