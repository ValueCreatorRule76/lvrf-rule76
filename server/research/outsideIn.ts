import type { Pool, PoolClient } from 'pg';

/**
 * S2 (3.1; LVRF_PLAN §21, D5 as ruled by Brad, 18 Nov 2026) — which of an account's rows are not outside-in. Reads only.
 *
 * A row is outside-in when its evidence cites a source (source_reference), rests on a quote or a locator, is not an
 * attestation, a system export or an assessment result, is not simulated, and has no live link to a value outcome.
 *
 * Brad's ruling on Gate A's findings (18 Nov 2026): a row that fails is LEFT OUT of the account's prompt and never
 * sent, and the research page lists each one left out, with its short id and why. A call is refused only if a row
 * that fails would still be in the prompt. The pinned entity cannot be left out of a facts-phase prompt (the prompt
 * names it and every fact must be about it), so an entity that fails refuses the call; a fact or the disclosure regime
 * that fails is left out (composeAccountPrompt).
 */
export interface NotOutsideIn { what: 'entity' | 'regime' | 'fact'; id: string; label: string; why: string }

export async function notOutsideInRows(c: PoolClient | Pool, institutionId: string): Promise<NotOutsideIn[]> {
  const { rows } = await c.query<{ what: 'entity' | 'regime' | 'fact'; id: string; label: string; evidence_id: string | null; ek: string | null;
    ef: string | null; source_reference: string | null; simulated: boolean | null; linked: boolean }>(
    `SELECT CASE WHEN f.kind = 'disclosure_regime' THEN 'regime' ELSE 'fact' END AS what, f.id, f.kind::text AS label,
            e.id AS evidence_id, e.kind::text AS ek, e.evidence_form::text AS ef, e.source_reference, e.simulated,
            EXISTS (SELECT 1 FROM value_outcome_evidence l WHERE l.evidence_id = e.id AND l.withdrawn_at IS NULL) AS linked
       FROM institution_facts f LEFT JOIN evidence e ON e.id = f.evidence_id
      WHERE f.institution_id = $1 AND f.deleted_at IS NULL AND f.superseded_by_id IS NULL
     UNION ALL
     SELECT 'entity', n.id, n.legal_name, e.id, e.kind::text, e.evidence_form::text, e.source_reference, e.simulated,
            EXISTS (SELECT 1 FROM value_outcome_evidence l WHERE l.evidence_id = e.id AND l.withdrawn_at IS NULL)
       FROM institution_entities n LEFT JOIN evidence e ON e.id = n.evidence_id
      WHERE n.institution_id = $1 AND n.deleted_at IS NULL AND n.superseded_by_id IS NULL
      ORDER BY 1, 3, 2`,
    [institutionId],
  );
  const out: NotOutsideIn[] = [];
  for (const r of rows) {
    const why: string[] = [];
    if (!r.evidence_id) why.push('rests on no evidence');
    else {
      if (!r.source_reference || r.source_reference.trim() === '') why.push('cites no source');
      if (r.ef !== 'quote' && r.ef !== 'locator') {
        why.push(r.ef === 'statement' ? "rests on a person's statement, not a quote or a locator"
          : r.ef === 'legacy' ? 'was recorded before evidence forms, so it rests on no quote or locator' : 'rests on no quote or locator');
      }
      if (r.ek === 'attestation' || r.ek === 'system_export' || r.ek === 'assessment_result') why.push(`is ${r.ek.replace('_', ' ')} evidence, the account's own record`);
      if (r.simulated) why.push('is simulated');
      if (r.linked) why.push('is linked to a value outcome');
    }
    if (why.length > 0) out.push({ what: r.what, id: r.id, label: r.label, why: why.join('; ') });
  }
  return out;
}
