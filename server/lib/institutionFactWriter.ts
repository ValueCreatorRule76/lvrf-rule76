import type { PoolClient } from 'pg';
import type { EvidenceFormFields } from './evidenceFormBody.js';
import { checkFigure, recordFigureCheck } from './figureCheck.js';

/**
 * THE ONE WRITER OF institution_facts (Q4h moved it here from
 * routes/institutionFacts.ts, unchanged for that route). Two callers:
 *
 *   - POST /api/institutions/:id/facts (and .../supersede) — a fact typed
 *     by a person (routes/institutionFacts.ts); the supersede route's
 *     pointer from the old fact to its successor is pointFactAtSuccessor;
 *   - POST /api/account-research-results/:id/accept — a researched fact a
 *     person accepted (routes/accountResearch.ts, 3.0 item 6).
 *
 * The evidence row is the fact's provenance: both are written, or neither,
 * on the caller's client inside actorContext's transaction. A CHECK cannot
 * see across the two tables; this function is what keeps the evidence and
 * the fact on the same institution. "No hop left short" (3.0 item 6) is
 * this function being the only path.
 */

export type WritableFactKind = 'revenue' | 'headcount' | 'stated_priority' | 'system' | 'disclosure_regime';

export const KIND_LABEL: Record<WritableFactKind, string> = {
  revenue: 'Revenue',
  headcount: 'Headcount',
  stated_priority: 'Stated priority',
  system: 'System',
  disclosure_regime: 'Disclosure regime',
};

/**
 * Everything a fact carries except its kind — shared by every caller.
 * P1 (0039): what its evidence rests on (EvidenceFormFields) — for a fact, a
 * quote or a locator, never a person's statement.
 */
export interface FactFields extends EvidenceFormFields {
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  asOf: string;
  evidenceKind: string;
  provenance: string;
  confidence: 'low' | 'medium' | 'high';
  sourceReference: string | null;
  sourceVerified: boolean;
  aiSourced: boolean;
  researchQuery: string | null;
  researchTool: string | null;
  /**
   * Q4h (H1): set when the person recording the fact confirms they opened
   * its citation — written as citation_resolved by that person, now
   * (evidence_resolution_requires_human; final once set,
   * evidence_resolution_is_final). Absent for a typed fact.
   */
  citationResolvedByPersonId?: string | null;
}

/** The evidence row alone — also used for an entity's provenance (Q4h). */
export async function insertEvidence(
  client: PoolClient,
  institutionId: string,
  summary: string,
  f: Omit<FactFields, 'valueNumeric' | 'valueText' | 'unit' | 'asOf'>,
  actorPersonId: string,
): Promise<string> {
  const resolvedBy = f.citationResolvedByPersonId ?? null;
  const { rows: [evidenceRow] } = await client.query<{ id: string }>(
    `INSERT INTO evidence (
       institution_id, kind, summary, provenance, source_reference,
       confidence, source_verified, ai_sourced, research_query, research_tool,
       simulated, captured_by_person_id,
       citation_resolved, citation_resolved_by_person_id, citation_resolved_at,
       evidence_form, quote_text, locator, how_read
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11,
               $12::uuid IS NOT NULL, $12::uuid, CASE WHEN $12::uuid IS NULL THEN NULL ELSE now() END,
               $13, $14, $15, $16)
     RETURNING id`,
    [
      institutionId, f.evidenceKind, summary, f.provenance, f.sourceReference,
      f.confidence, f.sourceVerified, f.aiSourced, f.researchQuery, f.researchTool,
      actorPersonId, resolvedBy,
      f.evidenceForm, f.quoteText, f.locator === null ? null : JSON.stringify(f.locator), f.howRead,
    ],
  );
  return evidenceRow.id;
}

/**
 * The evidence row, then the fact. Runs on the request's client, inside
 * actorContext's transaction. `onTable` names the write in flight, for
 * handleGovernanceError's refusal record.
 */
export async function insertFactWithEvidence(
  client: PoolClient,
  institutionId: string,
  kind: WritableFactKind,
  f: FactFields,
  actorPersonId: string,
  onTable: (table: string) => void,
): Promise<{ factId: string; evidenceId: string }> {
  // summary is a mechanical restatement of the submitted fact, not
  // authored prose — the provenance is what the person states.
  const shown = f.valueText ?? (f.valueNumeric === null ? '' : `${f.valueNumeric}${f.unit ? ` ${f.unit}` : ''}`);
  const summary = `${KIND_LABEL[kind]}: ${shown} (as of ${f.asOf})`;

  onTable('evidence');
  const evidenceId = await insertEvidence(client, institutionId, summary, f, actorPersonId);

  onTable('institution_facts');
  const { rows: [fact] } = await client.query<{ id: string }>(
    `INSERT INTO institution_facts (
       institution_id, kind, value_numeric, value_text, unit, as_of,
       evidence_id, captured_by_person_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [institutionId, kind, f.valueNumeric, f.valueText, f.unit, f.asOf, evidenceId, actorPersonId],
  );

  // P1: the figure check, recorded beside the fact. It never blocks the write.
  onTable('figure_checks');
  const checked = checkFigure({ numeric: f.valueNumeric, text: f.valueNumeric === null ? f.valueText : null },
    { form: f.evidenceForm, quoteText: f.quoteText, locator: f.locator });
  await recordFigureCheck(client, {
    institutionId, evidenceId, subjectTable: 'institution_facts', subjectId: fact.id,
    subjectField: f.valueNumeric === null ? 'value_text' : 'value_numeric',
    valueChecked: f.valueNumeric === null ? f.valueText : String(f.valueNumeric), actorPersonId,
  }, checked);
  return { factId: fact.id, evidenceId };
}

/**
 * The other write to institution_facts: a correction points the old fact at
 * its successor, with the reason (0028). Guarded on superseded_by_id IS
 * NULL: of two corrections racing, the second blocks on the row lock, then
 * matches nothing — the caller answers 409 and its new fact rolls back.
 * Returns whether the old fact was pointed.
 */
export async function pointFactAtSuccessor(
  client: PoolClient,
  factId: string,
  successorId: string,
  reason: string,
): Promise<boolean> {
  const { rows: [updated] } = await client.query<{ id: string }>(
    `UPDATE institution_facts
        SET superseded_by_id = $1, supersession_reason = $2
      WHERE id = $3 AND superseded_by_id IS NULL
      RETURNING id`,
    [successorId, reason, factId],
  );
  return Boolean(updated);
}
