import type { PoolClient } from 'pg';

/**
 * C3 (Brad, 26 Oct 2026; rulings B + C) — the errata the seals call for: for each locked run of a tenant,
 * the points its seal credited to a person who is not customer-side under the C3 rule. Read from the seal,
 * never typed; never a recomputed total. The steward records them as one batch (routes/creditAndMarks.ts): a dry run
 * first, then one erratum and one act per run, refused if the count changed.
 *
 * Which points, from the seal:
 *   - C3b (Brad, 27 Oct 2026; C3b-D1, condition 1): the definition factor, earned, its confirmer at sealing not
 *     customer-side. The seal does not name the confirmer (1.0.2 seals do), so it is read from the metric version
 *     the run sealed — its sealed id, or the one version current at the run's sealing that matches the sealed
 *     metric — and that version's confirmer as the audit log held it then. If either is not exact, the erratum
 *     says "the confirmer is not recoverable from this seal" and counts no points for it. No guessing;
 *   - an evidence factor (baseline, actual) whose strongest item was an attestation (its sealed note:
 *     "Strongest — attested by <name>"), the attestation by a person not customer-side: all its earned
 *     points rest on that attestation (were an independent item stronger, the attestation would not be
 *     the strongest);
 *   - the committer or verifier factor, earned, its note naming the outcome's committer or verifier, that
 *     person not customer-side.
 * A run already carrying a current credit erratum is left out.
 */
export interface CreditErratum {
  run_id: string; run_number: number; engagement: string; account: string; institution_id: string;
  value_outcome_id: string; sealed_score: number; sealed_band: string;
  model_version: string | null; model_fingerprint: string | null;
  points: number; parts: string[]; text: string;
  /** C3b (ruling 2): its only credit rests on a confirmer not recoverable from the seal: points 0, the rule not applied. */
  unrecoverable_only: boolean;
}

interface SealedFactor { factor: string; question?: string; weight?: number; earned: number; note?: string; gap?: string | null }
interface SealedMetric { id?: string; name?: string; unit?: string; direction?: string; sourceSystem?: string }
interface SealedItem { kind: string; summary: string; provenance: string; supports: string; source_verified: boolean }
interface Person { id: string; full_name: string; customer_side: boolean; reason: string | null }

const FACTOR_SUPPORT: Record<string, string> = { baseline_evidence_verified: 'baseline', actual_evidence_verified: 'actual' };
const n1 = (x: number) => String(Math.round(x * 10) / 10);

/**
 * C3b (condition 1): what a credit erratum says of the definition factor, from its sealed row and the confirmer at
 * sealing — null when that is not recoverable: then it says so, in Brad's words, and counts no points. A
 * customer-side confirmer earns the credit, so nothing is said.
 */
export function definitionPart(def: SealedFactor, who: { full_name: string; customer_side: boolean } | null): { points: number; part: string | null } {
  const q = `"${def.question ?? def.factor}"`;
  const earned = Number(def.earned);
  if (who === null) {
    return { points: 0, part: `${n1(earned)} of ${def.weight ?? '?'} in ${q} rest on a confirmer: the confirmer is not recoverable from this seal, so no points are counted for it` };
  }
  if (who.customer_side) return { points: 0, part: null };
  return { points: earned, part: `${n1(earned)} of ${def.weight ?? '?'} in ${q} rest on a confirmation by ${who.full_name}` };
}

/**
 * What a credit erratum says, from its parts. C3b (Brad, 31 Oct 2026, ruling 2): where credit rests on a confirmer
 * not recoverable from the seal, it says the C3 rule cannot be applied to it; a run with nothing else still gets
 * an erratum (points 0), saying so. Either way the sealed score stands.
 */
export function creditErratumText(parts: string[], whoNot: string, unrecoverable: boolean, score: number): string {
  return `From this run's seal: ${parts.join('; ')}. `
    + (whoNot ? `Under the C3 rule (model 1.0.2) none of these earns credit: ${whoNot}. ` : '')
    + (unrecoverable ? 'The C3 rule cannot be applied to credit resting on a confirmer not recoverable from this seal. ' : '')
    + `The sealed score, ${n1(score)} / 100, stands.`;
}

/**
 * C3b-D1 (condition 1): the person who had confirmed the definition when the run was sealed, or null when that is
 * not exact. The metric version: the run's sealed id; else, among the versions of the metric chain of the outcome
 * the run sealed, the one current at its sealing (created at or before it, no successor created at or before it)
 * whose name, unit, direction and source system match the seal — exactly one, or null. Its confirmer: the audit
 * log's last row for that version at or before the sealing, with a confirmation dated at or before it.
 */
export async function confirmerAtSealing(client: PoolClient, runId: string, sealedAt: Date, outcomeId: string | null,
  sealed: SealedMetric | undefined): Promise<string | null> {
  void runId;
  let metricId: string | null = sealed?.id ?? null;
  if (!metricId) {
    if (!outcomeId || !sealed) return null;
    const { rows } = await client.query<{ id: string }>(
      `WITH RECURSIVE start AS (SELECT business_metric_id AS id FROM value_outcomes WHERE id = $1),
         back(id) AS (SELECT id FROM start UNION SELECT m.id FROM business_metrics m JOIN back b ON m.superseded_by_id = b.id),
         fwd(id) AS (SELECT id FROM start UNION SELECT m.superseded_by_id FROM business_metrics m JOIN fwd f ON m.id = f.id WHERE m.superseded_by_id IS NOT NULL),
         chain AS (SELECT id FROM back UNION SELECT id FROM fwd)
       SELECT m.id FROM business_metrics m JOIN chain c ON c.id = m.id
        WHERE m.created_at <= $2
          AND NOT EXISTS (SELECT 1 FROM business_metrics s WHERE s.id = m.superseded_by_id AND s.created_at <= $2)
          AND m.name = $3 AND m.unit = $4 AND m.direction::text = $5 AND m.source_system = $6`,
      [outcomeId, sealedAt, sealed.name ?? '', sealed.unit ?? '', sealed.direction ?? '', sealed.sourceSystem ?? '']);
    if (rows.length !== 1) return null;
    metricId = rows[0].id;
  }
  const { rows: [a] } = await client.query<{ by: string | null; at: string | null }>(
    `SELECT a.new_row->>'definition_confirmed_by_person_id' AS by, a.new_row->>'definition_confirmed_at' AS at
       FROM audit_log a WHERE a.table_name = 'business_metrics' AND a.record_id = $1::text AND a.at <= $2
      ORDER BY a.at DESC, a.id DESC LIMIT 1`, [metricId, sealedAt]);
  if (!a || !a.by || !a.at || new Date(a.at) > sealedAt) return null;
  return a.by;
}

export async function listCreditErrata(client: PoolClient, tenantId: string): Promise<CreditErratum[]> {
  const { rows: runs } = await client.query<{ id: string; run_number: number; engagement_id: string; engagement: string;
    institution_id: string; account: string; created_at: Date; outcome_at_sealing: string | null;
    payload: { confidence?: { score: number; band: string; modelVersion?: string; modelFingerprint?: string; factors?: SealedFactor[] };
      evidence?: SealedItem[]; valueOutcomeId?: string; businessMetric?: SealedMetric; people?: { definition_confirmer?: { name: string } | null } } }>(
    `SELECT r.id, r.run_number, g.id AS engagement_id, g.name AS engagement, i.id AS institution_id, i.name AS account, r.payload,
            r.created_at, lvrf_run_outcome_at_sealing(r.id) AS outcome_at_sealing
       FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
      WHERE r.tenant_id = $1 AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM run_errata x WHERE x.value_run_id = r.id AND x.kind = 'non_customer_credit')
      ORDER BY i.name, g.name, r.run_number`,
    [tenantId],
  );
  const people = new Map<string, Person | null>();
  const person = async (id: string | null, inst: string): Promise<Person | null> => {
    if (!id) return null;
    const k = `${id}|${inst}`;
    if (!people.has(k)) {
      const { rows: [p] } = await client.query<Person>(
        'SELECT p.id, p.full_name, lvrf_customer_side(p.id, $2) AS customer_side, lvrf_customer_side_reason(p.id, $2) AS reason FROM persons p WHERE p.id = $1',
        [id, inst]);
      people.set(k, p ?? null);
    }
    return people.get(k)!;
  };
  const out: CreditErratum[] = [];
  for (const r of runs) {
    const c = r.payload.confidence;
    if (!c?.factors) continue;
    const parts: string[] = [];
    const not: Map<string, string> = new Map();
    let points = 0;
    let unrecoverable = false;
    const creditedEvidence: string[] = [];
    // C3b: the definition factor — its confirmer at sealing, read from the metric version the run sealed.
    const def = c.factors.find((f) => f.factor === 'metric_definition_confirmed');
    if (def && Number(def.earned) > 0) {
      const who = await confirmerAtSealing(client, r.id, r.created_at, r.outcome_at_sealing, r.payload.businessMetric);
      const p = who === null ? null : await person(who, r.institution_id);
      const d = definitionPart(def, who === null ? null : p);
      unrecoverable = who === null;
      points += d.points;
      if (d.part) parts.push(d.part);
      if (p && !p.customer_side && d.points > 0) not.set(p.full_name, p.reason ?? 'not customer-side');
    }
    // The evidence factors: an attestation by a person not customer-side, strongest in the factor.
    for (const f of c.factors) {
      const support = FACTOR_SUPPORT[f.factor];
      if (!support || !(Number(f.earned) > 0)) continue;
      const m = /Strongest — attested by (.+?)\.?$/.exec(f.note ?? '');
      if (!m) continue;
      const items = (r.payload.evidence ?? []).filter((e) => e.supports === support && e.source_verified);
      for (const it of items) {
        const { rows: [ev] } = await client.query<{ id: string; attested_by_person_id: string | null }>(
          `SELECT id, attested_by_person_id FROM evidence WHERE institution_id = $1 AND kind::text = $2 AND summary = $3 AND provenance = $4
            ORDER BY created_at LIMIT 1`, [r.institution_id, it.kind, it.summary, it.provenance]);
        const p = await person(ev?.attested_by_person_id ?? null, r.institution_id);
        if (!p || p.customer_side || !m[1].startsWith(p.full_name)) continue;
        points += Number(f.earned);
        creditedEvidence.push(ev.id);
        parts.push(`${n1(Number(f.earned))} of ${f.weight ?? '?'} in "${f.question ?? f.factor}" rest on an attestation by ${p.full_name}`);
        not.set(p.full_name, p.reason ?? 'not customer-side');
        break;
      }
    }
    // The committer and the verifier factors. C3b: a run that sealed no outcome is named by the outcome current at its sealing.
    const outcomeId = r.payload.valueOutcomeId ?? r.outcome_at_sealing ?? (await client.query<{ id: string }>(
      `SELECT vo.id FROM value_outcomes vo
        WHERE vo.engagement_id = $1 AND vo.deleted_at IS NULL
        ORDER BY (EXISTS (SELECT 1 FROM value_outcome_evidence l WHERE l.value_outcome_id = vo.id AND l.evidence_id = ANY($2::uuid[]))) DESC, vo.created_at
        LIMIT 1`, [r.engagement_id, creditedEvidence])).rows[0]?.id;
    if (!outcomeId) continue;
    const { rows: [vo] } = await client.query<{ committed_by_person_id: string | null; verified_by_person_id: string | null }>(
      'SELECT committed_by_person_id, verified_by_person_id FROM value_outcomes WHERE id = $1', [outcomeId]);
    for (const [factor, who, verb] of [['human_commit_of_record', vo?.committed_by_person_id, 'as committer'], ['human_verifier_of_record', vo?.verified_by_person_id, 'as verifier']] as const) {
      const f = c.factors.find((x) => x.factor === factor);
      if (!f || !(Number(f.earned) > 0)) continue;
      const p = await person(who ?? null, r.institution_id);
      if (!p || p.customer_side || !(f.note ?? '').includes(p.full_name)) continue;
      points += Number(f.earned);
      parts.push(`${n1(Number(f.earned))} of ${f.weight ?? '?'} in "${f.question ?? factor}" were credited to ${p.full_name} ${verb}`);
      not.set(p.full_name, p.reason ?? 'not customer-side');
    }
    // C3b (ruling 2): a run whose only credit rests on a confirmer not recoverable still gets an erratum, at 0 points.
    if (points <= 0 && !unrecoverable) continue;
    const whoNot = [...not.entries()].map(([name, why]) => `${name} is not customer-side (${why})`).join('; ');
    out.push({
      run_id: r.id, run_number: r.run_number, engagement: r.engagement, account: r.account, institution_id: r.institution_id,
      value_outcome_id: outcomeId, sealed_score: Number(c.score), sealed_band: c.band,
      model_version: c.modelVersion ?? null, model_fingerprint: c.modelVersion ? (c.modelFingerprint ?? null) : null,
      points, parts, unrecoverable_only: points <= 0,
      text: creditErratumText(parts, whoNot, unrecoverable, Number(c.score)),
    });
  }
  return out;
}
