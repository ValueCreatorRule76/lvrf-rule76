import type { PoolClient } from 'pg';

/**
 * C3b (Brad, 27 Oct 2026; LVRF_PLAN §15; C3b-D3, D4; conditions 3 and 5) — a figure with no source on record.
 *
 * A steward records a finding on an outcome's figure (figure_findings); the batch then records, beside each
 * locked run whose seal carries that figure at that value, an 'unsourced_figure' erratum. Every sentence is
 * built by the server from the record, never typed:
 *   - who entered the figure: the audit log's first row that gave the outcome that value, and that person;
 *   - "nothing from <account> exists in LVRF": the three facts lvrf_figure_finding_blockers checks, each named.
 *     The database re-checks them on the finding and on every erratum, so the sentence is true whenever written.
 * It says "no source on record", never "invented" (Brad's ruling 2; figure_findings_never_invented,
 * run_errata_never_invented).
 */
export const FIGURE_FIELDS = {
  baseline_value: { label: 'baseline', key: 'baselineValue' },
  actual_value: { label: 'actual', key: 'actualValue' },
  claimed_currency_impact: { label: 'claimed currency impact', key: 'claimedCurrencyImpact' },
} as const;
export type FigureField = keyof typeof FIGURE_FIELDS;
export const isFigureField = (x: unknown): x is FigureField => typeof x === 'string' && x in FIGURE_FIELDS;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
/** numeric(18,4) as the record holds it, without trailing zeros: 214.0000 → "214". */
export const figureText = (v: string | number) => String(Number(v));

export interface EnteredBy { name: string; role: string; at: Date }

/** Who first gave the outcome this value, from the audit log (append-only), and their role as the record names it. */
export async function enteredBy(client: PoolClient, outcomeId: string, field: FigureField, value: string, account: string): Promise<EnteredBy | null> {
  const { rows: [a] } = await client.query<{ at: Date; name: string; title: string | null; vendor: boolean }>(
    `SELECT a.at, p.full_name AS name, p.title, p.tenant_id IS NOT NULL AS vendor
       FROM audit_log a JOIN persons p ON p.id = a.actor_person_id
      WHERE a.table_name = 'value_outcomes' AND a.record_id = $1::text AND (a.new_row->>$2)::numeric = $3::numeric
      ORDER BY a.at, a.id LIMIT 1`, [outcomeId, field, value]);
  if (!a) return null;
  const title = (a.title ?? '').trim();
  const role = a.vendor
    ? (title ? `the vendor's ${title.toLowerCase()}` : "the vendor's staff")
    : (title ? `${title}, of ${account}` : `a person of ${account}`);
  return { name: a.name, role, at: a.at };
}

/** The three facts, named for the account, as the finding states them. */
const nothingFrom = (account: string) =>
  `nothing from ${account} exists in LVRF (no person of ${account} is customer-side; no evidence of ${account} has an opened citation `
  + `or a customer-side attester; no research result or fact about ${account} was accepted)`;

export function findingText(field: FigureField, value: string, unit: string | null, who: EnteredBy | null, account: string): string {
  const fig = `${figureText(value)}${unit ? ` ${unit}` : ''}`;
  const entry = who ? `it was entered by ${who.name}, ${who.role}, on ${day(who.at)}` : 'who entered it is not on record';
  return `The ${FIGURE_FIELDS[field].label}, ${fig}, has no source on record: ${entry}, and ${nothingFrom(account)}.`;
}

export async function blockers(client: PoolClient, institutionId: string): Promise<string[]> {
  const { rows: [b] } = await client.query<{ b: string[] }>('SELECT lvrf_figure_finding_blockers($1) AS b', [institutionId]);
  return b.b ?? [];
}

interface Finding { id: string; value_outcome_id: string; institution_id: string; account: string; field: FigureField; value: string; finding_text: string; unit: string | null }

export interface UnsourcedErratum {
  run_id: string; run_number: number; engagement: string; account: string; institution_id: string;
  value_outcome_id: string; figure_finding_id: string; sealed_score: number; sealed_band: string;
  model_version: string | null; model_fingerprint: string | null; line: string; text: string;
}

/**
 * The errata the tenant's findings call for: one per locked run whose seal carries the finding's figure at its
 * value, for the outcome the run sealed (lvrf_run_outcome_at_sealing: exact or none), not yet recorded. A finding
 * whose account now holds something from it (a blocker) calls for none, and is listed with why.
 */
export async function listUnsourcedErrata(client: PoolClient, tenantId: string): Promise<{ errata: UnsourcedErratum[]; blocked: { figure_finding_id: string; account: string; why: string[] }[] }> {
  const { rows: findings } = await client.query<Finding>(
    `SELECT f.id, f.value_outcome_id, f.institution_id, i.name AS account, f.field, f.value::text AS value, f.finding_text, bm.unit
       FROM figure_findings f JOIN institutions i ON i.id = f.institution_id
       JOIN value_outcomes vo ON vo.id = f.value_outcome_id JOIN business_metrics bm ON bm.id = vo.business_metric_id
      WHERE f.tenant_id = $1 ORDER BY f.recorded_at`, [tenantId]);
  const errata: UnsourcedErratum[] = [];
  const blocked: { figure_finding_id: string; account: string; why: string[] }[] = [];
  for (const f of findings) {
    const why = await blockers(client, f.institution_id);
    if (why.length > 0) { blocked.push({ figure_finding_id: f.id, account: f.account, why }); continue; }
    const key = FIGURE_FIELDS[f.field].key;
    const { rows: runs } = await client.query<{ id: string; run_number: number; engagement: string;
      payload: { confidence?: { score: number; band: string; modelVersion?: string; modelFingerprint?: string }; businessMetric?: { unit?: string; sourceSystem?: string } } & Record<string, unknown> }>(
      `SELECT r.id, r.run_number, g.name AS engagement, r.payload
         FROM value_runs r JOIN engagements g ON g.id = r.engagement_id
        WHERE r.tenant_id = $1 AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL
          AND lvrf_run_outcome_at_sealing(r.id) = $2 AND (r.payload->>$3)::numeric = $4::numeric
          AND NOT EXISTS (SELECT 1 FROM run_errata x WHERE x.value_run_id = r.id AND x.kind = 'unsourced_figure' AND x.figure_finding_id = $5)
        ORDER BY r.run_number`, [tenantId, f.value_outcome_id, key, f.value, f.id]);
    for (const r of runs) {
      const c = r.payload.confidence;
      if (!c) continue;
      const unit = r.payload.businessMetric?.unit ?? f.unit;
      const fig = `${figureText(f.value)}${unit ? ` ${unit}` : ''}`;
      const src = f.field === 'baseline_value' && r.payload.businessMetric?.sourceSystem
        ? `, with its stated source "${r.payload.businessMetric.sourceSystem}"` : '';
      errata.push({
        run_id: r.id, run_number: r.run_number, engagement: r.engagement, account: f.account, institution_id: f.institution_id,
        value_outcome_id: f.value_outcome_id, figure_finding_id: f.id, sealed_score: Number(c.score), sealed_band: c.band,
        model_version: c.modelVersion ?? null, model_fingerprint: c.modelVersion ? (c.modelFingerprint ?? null) : null,
        line: `erratum: its ${FIGURE_FIELDS[f.field].label}, ${figureText(f.value)}, has no source on record`,
        text: `From this run's seal: its ${FIGURE_FIELDS[f.field].label}, ${fig}${src}. ${f.finding_text} The sealed record below is unchanged.`,
      });
    }
  }
  return { errata, blocked };
}
