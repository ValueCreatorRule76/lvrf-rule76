/**
 * S4 (3.1; LVRF_PLAN §23; Brad, 19 Nov 2026) — a field may not repeat another.
 *
 * The route's half of the rule; 0052's nine CHECKs on `evidence` are the database's half, with the same pairs, the
 * same comparison and the same sentences (PLAIN_CHECK, keyed by the CHECK's name). A route refuses before the write,
 * so the refusal is recorded as the route's; a writer that skips this still meets the CHECK.
 *
 *   The five free-text fields of an evidence row, by their form labels. `locator` is a structured cell, not free text,
 *   and is not compared (named for Brad in §23).
 *   The comparison (D5): trimmed, runs of whitespace collapsed to one space, lower-cased; equality, not "contains".
 *   An empty or absent value repeats nothing.
 *   Summary against the quote (D2, Brad's change) is the one pair exempt: the form warns instead.
 */
import { PLAIN_CHECK } from './plainChecks.js';

export type EvidenceTextField = 'summary' | 'provenance' | 'source_reference' | 'quote_text' | 'how_read';

export const EVIDENCE_FIELD_LABEL: Record<EvidenceTextField, string> = {
  summary: 'What it states',
  provenance: 'Where it came from',
  source_reference: 'The citation',
  quote_text: 'The quote',
  how_read: 'How it was read',
};

/** The nine refused pairs, each with the CHECK that is its database half. */
export const EVIDENCE_PAIRS: { a: EvidenceTextField; b: EvidenceTextField; check: string }[] = [
  { a: 'summary', b: 'provenance', check: 'evidence_summary_not_provenance' },
  { a: 'summary', b: 'source_reference', check: 'evidence_summary_not_reference' },
  { a: 'summary', b: 'how_read', check: 'evidence_summary_not_how_read' },
  { a: 'provenance', b: 'source_reference', check: 'evidence_provenance_not_reference' },
  { a: 'provenance', b: 'quote_text', check: 'evidence_provenance_not_quote' },
  { a: 'provenance', b: 'how_read', check: 'evidence_provenance_not_how_read' },
  { a: 'source_reference', b: 'quote_text', check: 'evidence_reference_not_quote' },
  { a: 'source_reference', b: 'how_read', check: 'evidence_reference_not_how_read' },
  { a: 'quote_text', b: 'how_read', check: 'evidence_quote_not_how_read' },
];

export function normalise(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

export function same(a: unknown, b: unknown): boolean {
  const x = normalise(a);
  return x !== '' && x === normalise(b);
}

/** The sentence for the first refused pair whose two values are the same, or null. */
export function evidenceRepeat(v: Partial<Record<EvidenceTextField, string | null>>): string | null {
  for (const p of EVIDENCE_PAIRS) if (same(v[p.a], v[p.b])) return PLAIN_CHECK[p.check];
  return null;
}

/** For a reason given with an act on an evidence row: the label of the first field it repeats, or null. */
export function reasonRepeats(reason: string, rows: { which: string; v: Partial<Record<EvidenceTextField, string | null>> }[]): string | null {
  for (const r of rows) {
    for (const f of Object.keys(EVIDENCE_FIELD_LABEL) as EvidenceTextField[]) {
      if (same(reason, r.v[f])) return `${EVIDENCE_FIELD_LABEL[f]} of ${r.which}`;
    }
  }
  return null;
}
