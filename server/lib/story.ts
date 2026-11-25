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
 * The stage (D2, D3): a reference example is 'reference', never Decision; otherwise 'compounding' when two or more sealed
 * real runs are verified (realization 'verified', the banners' rule) on different sealed actual evidence; 'realization'
 * when one is; 'decision' when a real run is locked. With no locked real run there is nothing to tell (null).
 *
 * It writes nothing.
 */

export type StoryStage = 'reference' | 'decision' | 'realization' | 'compounding';
export type StoryAudience = 'internal' | 'client';
export const STORY_VERSION = 1;

type Q = Pick<PoolClient, 'query'> | Pick<Pool, 'query'>;

export interface StoryErratum { id: string; kind: string; line: string; recorded_on: string; group: string }
export interface StoryRun {
  id: string; run_number: number; locked_on: string; score: number; band: string; payload_hash: string;
  realization: string | null; errata: StoryErratum[];
}
export interface StoryEngagement {
  id: string; name: string; retired: boolean; runs: StoryRun[]; latest_run_id: string;
  metric: { name: string; unit: string | null; baseline: number | null };
  asks: { code: string; need: string; question: string }[];
}
export interface StoryFinding { id: string; outcome_id: string; field: string; value: string; line: string; recorded_on: string }
export interface StoryPublished {
  id: string; kind: string; class: string; class_label: string; can: string; cannot: string; basis: string;
  form: string; quote: string | null; locator: unknown; how_read: string | null; summary: string; source_reference: string | null;
  open_state: 'verified' | 'not_supported' | 'unopened';
}
export interface LedgerEntry { n: number; figure: string; source: string; ids: string[]; full_hash?: string }
export interface StoryPayload {
  storyVersion: number; audience: StoryAudience; stage: StoryStage;
  account: { id: string; name: string }; prepared_by: string;
  marker: { kind: string; note: string | null } | null;
  title: string; subtitle: string | null;
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
  const { rows: [acct] } = await db.query<{ id: string; name: string; tenant: string; marker_kind: string | null; marker_note: string | null }>(
    `SELECT i.id, i.name, t.name AS tenant, k.kind AS marker_kind, k.note AS marker_note
       FROM institutions i JOIN tenants t ON t.id = i.tenant_id
       LEFT JOIN reference_example_markers k ON k.institution_id = i.id AND k.deleted_at IS NULL AND k.superseded_by_id IS NULL
      WHERE i.id = $1 AND i.tenant_id = $2 AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL`, [institutionId, tenantId]);
  if (!acct) return null;
  const marker = acct.marker_kind ? { kind: acct.marker_kind, note: acct.marker_note } : null;
  // D4: a reference example renders for the internal audience only.
  if (marker && audience !== 'internal') throw new StoryRefusal("A reference example's story is for your company's people only; it has no client copy.");

  const { rows: runs } = await db.query<{
    id: string; engagement_id: string; engagement: string; retired: boolean; run_number: number; locked_at: Date;
    score: number; band: string; payload_hash: string; payload: Record<string, any>;
  }>(
    `SELECT r.id, g.id AS engagement_id, g.name AS engagement, (g.deleted_at IS NOT NULL OR g.status::text = 'retired') AS retired,
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

  const { rows: findingRows } = await db.query<{ id: string; value_outcome_id: string; field: string; value: string; unit: string | null; recorded_at: Date }>(
    `SELECT f.id, f.value_outcome_id, f.field::text, trim_scale(f.value)::text AS value, bm.unit, f.recorded_at
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
            metric: { name: '', unit: null, baseline: null }, asks: [] };
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
  }

  // The stage (D2, D3).
  let stage: StoryStage;
  if (marker) stage = 'reference';
  else {
    const verified = runs.filter((r) => r.payload.realization === 'verified');
    const actualHeads = new Set(verified.map((r) => ((r.payload.evidence ?? []) as { supports: string; evidence_id?: string; id?: string }[])
      .filter((e) => e.supports === 'actual').map((e) => e.evidence_id ?? e.id ?? '').sort().join(',')).filter((k) => k !== ''));
    stage = verified.length >= 2 && actualHeads.size >= 2 ? 'compounding' : verified.length >= 1 ? 'realization' : 'decision';
  }

  const findings: StoryFinding[] = findingRows.map((f) => {
    const value = trimNum(f.value);
    return { id: f.id, outcome_id: f.value_outcome_id, field: f.field, value,
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

  // The ledger (D7): every figure the text prints is a numbered entry. Order: each engagement's headline score and its
  // errata groups, then the findings, the measure's baseline, the published rows, then the earlier runs' scores.
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
    const runsNamed = [...new Set(all.map(({ g, r }) => runLabel(g, r)))];
    const ids = [...new Set(all.map(({ x }) => x.id))];
    return { ids, source: `Errata on ${runsNamed.join('; ')}, in the platform's wording for their kind`, first: all[0]?.x.line ?? '' };
  };
  const scoreEntry = (g: StoryEngagement, r: StoryRun) =>
    add(`run:${r.id}`, `${r.score} / 100, ${r.band}`, `Sealed ${runLabel(g, r)}, its confidence`, [r.id], r.payload_hash);
  for (const g of engagements) {
    const latest = g.runs.find((r) => r.id === g.latest_run_id)!;
    scoreEntry(g, latest);
    for (const x of latest.errata) {
      const eg = errataGroup(x.group);
      add(`erratum:${x.group}`, eg.first, eg.source, eg.ids);
    }
  }
  for (const f of findings) add(`finding:${f.id}`, `${f.value}, no source on record`, `Figure finding on the outcome ${f.outcome_id.slice(0, 8)}`, [f.id]);
  for (const g of engagements) {
    const latest = g.runs.find((r) => r.id === g.latest_run_id)!;
    if (g.metric.baseline !== null) {
      add(`baseline:${g.id}`, withUnit(g.metric.baseline, g.metric.unit), `Sealed ${runLabel(g, latest)}, the baseline field`, [latest.id], latest.payload_hash);
    }
  }
  for (const e of published) {
    add(`evidence:${e.id}`, e.summary, `Evidence ${e.id.slice(0, 8)} · ${e.kind.replace(/_/g, ' ')} · ${e.basis.replace(/_/g, ' ')} · ${e.form.replace(/_/g, ' ')} · ${e.open_state === 'verified' ? 'verified' : e.open_state === 'not_supported' ? 'opened; does not support it' : 'unverified'}`, [e.id]);
  }
  for (const g of engagements) {
    for (const r of g.runs) {
      scoreEntry(g, r);
      for (const x of r.errata) {
        const eg = errataGroup(x.group);
        add(`erratum:${x.group}`, eg.first, eg.source, eg.ids);
      }
    }
  }

  const title = storyTitle(stage);
  const subtitle = marker ? `A reference example, built from published sources: ${acct.name} has not engaged through LVRF` : null;

  return {
    storyVersion: STORY_VERSION, audience, stage,
    account: { id: acct.id, name: acct.name }, prepared_by: acct.tenant,
    marker, title, subtitle,
    engagements,
    headline: engagements.map((g) => ({ engagement_id: g.id, run_id: g.latest_run_id })),
    findings, published,
    evidence_heads: published.map((e) => e.id),
    ledger, refs,
  };
}
