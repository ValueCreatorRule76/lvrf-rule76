import type { PoolClient } from 'pg';

/**
 * C3 (Brad, 26 Oct 2026; rulings B + C) — the errata the seals call for: for each locked run of a tenant,
 * the points its seal credited to a person who is not customer-side under the C3 rule. Read from the seal,
 * never typed; never a recomputed total. The steward records them as one batch (routes/creditAndMarks.ts): a dry run
 * first, then one erratum and one act per run, refused if the count changed.
 *
 * Which points, from the seal:
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
}

interface SealedFactor { factor: string; question?: string; weight?: number; earned: number; note?: string; gap?: string | null }
interface SealedItem { kind: string; summary: string; provenance: string; supports: string; source_verified: boolean }
interface Person { id: string; full_name: string; customer_side: boolean; reason: string | null }

const FACTOR_SUPPORT: Record<string, string> = { baseline_evidence_verified: 'baseline', actual_evidence_verified: 'actual' };
const n1 = (x: number) => String(Math.round(x * 10) / 10);

export async function listCreditErrata(client: PoolClient, tenantId: string): Promise<CreditErratum[]> {
  const { rows: runs } = await client.query<{ id: string; run_number: number; engagement_id: string; engagement: string;
    institution_id: string; account: string; payload: { confidence?: { score: number; band: string; modelVersion?: string; modelFingerprint?: string; factors?: SealedFactor[] };
      evidence?: SealedItem[]; valueOutcomeId?: string } }>(
    `SELECT r.id, r.run_number, g.id AS engagement_id, g.name AS engagement, i.id AS institution_id, i.name AS account, r.payload
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
    const creditedEvidence: string[] = [];
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
    // The committer and the verifier factors.
    const outcomeId = r.payload.valueOutcomeId ?? (await client.query<{ id: string }>(
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
    if (points <= 0) continue;
    const whoNot = [...not.entries()].map(([name, why]) => `${name} is not customer-side (${why})`).join('; ');
    out.push({
      run_id: r.id, run_number: r.run_number, engagement: r.engagement, account: r.account, institution_id: r.institution_id,
      value_outcome_id: outcomeId, sealed_score: Number(c.score), sealed_band: c.band,
      model_version: c.modelVersion ?? null, model_fingerprint: c.modelVersion ? (c.modelFingerprint ?? null) : null,
      points, parts,
      text: `From this run's seal: ${parts.join('; ')}. Under the C3 rule (model 1.0.1) none of these earns credit: ${whoNot}. `
        + `The sealed score, ${n1(Number(c.score))} / 100, stands.`,
    });
  }
  return out;
}
