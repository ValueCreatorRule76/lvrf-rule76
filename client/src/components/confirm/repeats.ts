/**
 * S4 (3.1; LVRF_PLAN §23; Brad, 19 Nov 2026) — a field may not repeat another, said in the form before any request.
 * The server is the authority (server/lib/repeatedFields.ts, and 0052's CHECKs); this mirrors its pairs and its
 * comparison so the steward is told at the form, not by a refusal. Summary against the quote is warned, not refused.
 */
export type EvidenceTextField = 'summary' | 'provenance' | 'source_reference' | 'quote_text' | 'how_read';
export type EvidenceTexts = Partial<Record<EvidenceTextField, string | null | undefined>>;

export const EVIDENCE_FIELD_LABEL: Record<EvidenceTextField, string> = {
  summary: 'What it states',
  provenance: 'Where it came from',
  source_reference: 'The citation',
  quote_text: 'The quote',
  how_read: 'How it was read',
};

const PAIRS: [EvidenceTextField, EvidenceTextField][] = [
  ['summary', 'provenance'], ['summary', 'source_reference'], ['summary', 'how_read'],
  ['provenance', 'source_reference'], ['provenance', 'quote_text'], ['provenance', 'how_read'],
  ['source_reference', 'quote_text'], ['source_reference', 'how_read'], ['quote_text', 'how_read'],
];

export const normalise = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toLowerCase() : '');
export const same = (a: unknown, b: unknown): boolean => { const x = normalise(a); return x !== '' && x === normalise(b); };

/** Each refused pair whose values are the same, as an unmet line: "Where it came from repeats What it states". */
export function repeatedPairs(v: EvidenceTexts): string[] {
  return PAIRS.filter(([a, b]) => same(v[a], v[b])).map(([a, b]) => `${EVIDENCE_FIELD_LABEL[b]} repeats ${EVIDENCE_FIELD_LABEL[a]}: a field may not repeat another`);
}

/** D2 (Brad): the one pair warned, not refused. */
export const summaryRepeatsQuote = (v: EvidenceTexts): boolean => same(v.summary, v.quote_text);
export const SUMMARY_QUOTE_WARNING = 'This summary repeats the quote word for word';

/** A reason given with an act: the label of the first field it repeats, as "How it was read of the row it supersedes". */
export function reasonRepeats(reason: string, rows: { which: string; v: EvidenceTexts }[]): string | null {
  for (const r of rows) for (const f of Object.keys(EVIDENCE_FIELD_LABEL) as EvidenceTextField[]) if (same(reason, r.v[f])) return `${EVIDENCE_FIELD_LABEL[f]} of ${r.which}`;
  return null;
}
