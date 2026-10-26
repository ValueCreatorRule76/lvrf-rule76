/**
 * C2 (LVRF_PLAN §11; C2-D2, Brad, 25 Oct 2026) — the dry run before any erratum. Read-only.
 *
 * Lists every locked run that sealed a commitment's or a verification's attestation as support
 * for the impact basis, and for each: the run, its sealed score, and the recompute with that item
 * moved to the commitment or the verification, under the model the run was sealed with (the same
 * recomputeWithCorrection the erratum route uses). The steward records the errata through the UI,
 * one at a time, ticking each against this list.
 *
 * The attestations are found by the provenance commit and verify write
 * (server/routes/outcomeWalk.ts): "Attested at value outcome commitment by <name>" and
 * "Attested at value outcome verification by <name>". For each it also prints its current link:
 * still impact_basis (to be corrected), or already corrected.
 *
 * Writes nothing: one READ ONLY transaction, rolled back.
 *
 *   DATABASE_URL=... npx tsx scripts/report_c2_errata.ts
 */
import pg from 'pg';
import { recomputeWithCorrection } from '../server/lib/recomputeRun.js';

type Target = 'target_commitment' | 'verification';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN READ ONLY');
const { rows: atts } = await client.query<{
  evidence_id: string; kind: string; summary: string; provenance: string; value_outcome_id: string; engagement_id: string;
  account: string; current_supports: string | null; corrects_supports: string | null;
}>(
  `SELECT e.id AS evidence_id, e.kind::text, e.summary, e.provenance, vo.id AS value_outcome_id, vo.engagement_id, i.name AS account,
          cur.supports AS current_supports, cur.corrects_supports
     FROM evidence e
     JOIN (SELECT DISTINCT value_outcome_id, evidence_id FROM value_outcome_evidence) l ON l.evidence_id = e.id
     JOIN value_outcomes vo ON vo.id = l.value_outcome_id
     JOIN institutions i ON i.id = vo.institution_id
     LEFT JOIN value_outcome_evidence cur ON cur.value_outcome_id = l.value_outcome_id AND cur.evidence_id = e.id AND cur.withdrawn_at IS NULL
    WHERE e.kind = 'attestation'
      AND (e.provenance LIKE 'Attested at value outcome commitment by %' OR e.provenance LIKE 'Attested at value outcome verification by %')
    ORDER BY i.name, e.created_at`,
);
const { rows: runs } = await client.query<{ id: string; run_number: number; engagement_id: string; engagement: string; payload: Record<string, unknown> }>(
  `SELECT r.id, r.run_number, r.engagement_id, g.name AS engagement, r.payload
     FROM value_runs r JOIN engagements g ON g.id = r.engagement_id
    WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL
    ORDER BY g.name, r.run_number`,
);
const { rows: errata } = await client.query<{ value_run_id: string; evidence_id: string; corrected_to_supports: string }>(
  `SELECT value_run_id, evidence_id, corrected_to_supports FROM run_errata e
    WHERE NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = e.id)`,
);
await client.query('ROLLBACK');
await client.end();

let listed = 0, same = 0, refused = 0, recorded = 0;
for (const a of atts) {
  const target: Target = a.provenance.startsWith('Attested at value outcome commitment by ') ? 'target_commitment' : 'verification';
  const linkNow = a.current_supports === null ? 'no current link'
    : a.current_supports === target ? `corrected: now ${target}${a.corrects_supports ? ` (from ${a.corrects_supports})` : ''}`
    : `still ${a.current_supports}: to be corrected to ${target}`;
  console.log(`ATTESTATION ${a.account} · evidence ${a.evidence_id} · "${a.provenance}" · ${linkNow}`);
  for (const r of runs.filter((x) => x.engagement_id === a.engagement_id && x.payload.valueOutcomeId === a.value_outcome_id)) {
    const sealed = ((r.payload.evidence ?? []) as { kind: string; summary: string; provenance: string; supports: string }[])
      .filter((e) => e.kind === a.kind && e.summary === a.summary && e.provenance === a.provenance);
    if (!sealed.some((e) => e.supports === 'impact_basis')) continue;
    listed++;
    const rc = recomputeWithCorrection(r.payload as Parameters<typeof recomputeWithCorrection>[0], a, target);
    const conf = r.payload.confidence as { score: number; band: string; modelVersion?: string } | undefined;
    const has = errata.some((x) => x.value_run_id === r.id && x.evidence_id === a.evidence_id && x.corrected_to_supports === target);
    if (has) recorded++;
    if (!rc.ok) refused++;
    else if (rc.score === Number(conf?.score)) same++;
    console.log(`  RUN ${r.engagement} · run ${r.run_number} · ${r.id} · sealed ${conf?.score} / 100 · ${conf?.band} (model ${conf?.modelVersion ?? 'unrecorded'})`
      + ` · ${rc.ok ? `recomputed ${rc.score} / 100 · ${rc.band}` : `NOT RECOMPUTED: ${rc.reason}`}`
      + ` · erratum ${has ? 'RECORDED' : 'not yet recorded'}`);
  }
}
console.log(`${atts.length} commitment or verification attestation(s); ${listed} locked run(s) sealed one as the impact basis: `
  + `${same} recompute to the sealed score, ${listed - same - refused} to another, ${refused} not recomputed; ${recorded} erratum/errata already recorded. Nothing written.`);
