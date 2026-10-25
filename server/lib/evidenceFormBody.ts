import type { Locator, Scale } from './figureCheck.js';

/**
 * P1 (LVRF_PLAN §8, item 2) — the evidence form fields of a request body,
 * read the same way by every route that takes them: the typed fact and its
 * correction, an entity correction, a research accept, and outcome evidence.
 *
 * A body says what its evidence rests on:
 *   evidence_form: "quote"   with quote_text (at most 40 words) and how_read;
 *   evidence_form: "locator" with locator { document, value, scale, table?, row?, column? } and how_read;
 *   evidence_form: "statement" — only where the route allows it, and only for an
 *     observation citing no source or an attestation (Brad, 24 Oct 2026).
 * A body with both a quote and a locator, or neither, is refused in one plain
 * sentence (Q4k), which the caller records in refusals. The database holds the
 * same shape (evidence_form_shape, evidence_how_read), so this is the first
 * of two guards, never the only one.
 */

export const QUOTE_MAX_WORDS = 40;
export const HOW_READ_MIN = 24;
const SCALES: readonly Scale[] = ['units', 'thousands', 'millions', 'billions', 'percent'];
const LOCATOR_KEYS = ['document', 'value', 'scale', 'table', 'row', 'column'];

export interface EvidenceFormFields {
  evidenceForm: 'quote' | 'locator' | 'statement';
  quoteText: string | null;
  locator: Locator | null;
  howRead: string | null;
}

/** A refusal of the evidence form, in one plain sentence; the route records it and answers 422. */
export class EvidenceFormError extends Error {}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function parseEvidenceForm(
  body: Record<string, unknown>,
  opts: { allowStatement: boolean; kind: string; sourceReference: string | null },
): EvidenceFormFields {
  const form = body.evidence_form;
  const hasQuote = body.quote_text !== undefined && body.quote_text !== null && body.quote_text !== '';
  const hasLocator = body.locator !== undefined && body.locator !== null;
  if (form === undefined || form === null || form === '') {
    throw new EvidenceFormError(opts.allowStatement
      ? "Say what this evidence rests on: a quote (the source's own words), a locator (where in the document the value is), or a person's statement."
      : "Say what this evidence rests on: a quote (the source's own words) or a locator (where in the document the value is).");
  }
  if (form === 'statement') {
    if (!opts.allowStatement) {
      throw new EvidenceFormError("This evidence must rest on a quote or a locator: a person's statement is not a source for it.");
    }
    if (opts.kind !== 'observation' && opts.kind !== 'attestation') {
      throw new EvidenceFormError("A person's statement is an observation or an attestation; this evidence's kind rests on a source, so give a quote or a locator.");
    }
    if (opts.kind === 'observation' && opts.sourceReference) {
      throw new EvidenceFormError('An observation that cites a source rests on that source: give a quote or a locator, not a statement.');
    }
    if (hasQuote || hasLocator || (body.how_read !== undefined && body.how_read !== null && body.how_read !== '')) {
      throw new EvidenceFormError("A person's statement has no quote, locator or how-read: leave them empty, or choose a quote or a locator instead.");
    }
    return { evidenceForm: 'statement', quoteText: null, locator: null, howRead: null };
  }
  if (form !== 'quote' && form !== 'locator') {
    throw new EvidenceFormError(`The evidence form "${String(form)}" is not one LVRF records: give a quote or a locator${opts.allowStatement ? ", or a person's statement" : ''}.`);
  }
  if (hasQuote && hasLocator) {
    throw new EvidenceFormError('Give a quote or a locator, not both: evidence rests on one of them.');
  }
  const howRead = typeof body.how_read === 'string' ? body.how_read.trim() : '';
  const needHowRead = () => {
    if (howRead.length < HOW_READ_MIN) {
      throw new EvidenceFormError(`Say how the value was read from the source, in at least ${HOW_READ_MIN} characters: what you read and where, not a restatement of the source.`);
    }
  };
  if (form === 'quote') {
    if (!hasQuote || typeof body.quote_text !== 'string' || body.quote_text.trim() === '') {
      throw new EvidenceFormError(hasLocator
        ? 'This evidence is marked a quote but carries a locator: give the quote, or mark it a locator.'
        : "Give the quote: the source's own words the value comes from.");
    }
    const n = wordCount(body.quote_text);
    if (n > QUOTE_MAX_WORDS) {
      throw new EvidenceFormError(`The quote is ${n} words; a quote is at most ${QUOTE_MAX_WORDS}. Quote the sentence the value is in, or give a locator instead.`);
    }
    needHowRead();
    return { evidenceForm: 'quote', quoteText: body.quote_text.trim(), locator: null, howRead };
  }
  if (!hasLocator) {
    throw new EvidenceFormError(hasQuote
      ? 'This evidence is marked a locator but carries a quote: give the locator, or mark it a quote.'
      : 'Give the locator: the document, the value as it appears there, and its scale.');
  }
  const l = body.locator;
  if (typeof l !== 'object' || l === null || Array.isArray(l)) {
    throw new EvidenceFormError('The locator is the document, the value and its scale; it was not given in that shape.');
  }
  const loc = l as Record<string, unknown>;
  const extra = Object.keys(loc).filter((k) => !LOCATOR_KEYS.includes(k));
  if (extra.length) throw new EvidenceFormError(`A locator names the document, table, row, column, value and scale; "${extra[0]}" is not one of them.`);
  if (typeof loc.document !== 'string' || loc.document.trim() === '') throw new EvidenceFormError('Name the document the locator points into.');
  if (typeof loc.value !== 'number' || !Number.isFinite(loc.value)) throw new EvidenceFormError('Give the value as it appears in the document, as a number.');
  if (typeof loc.scale !== 'string' || !SCALES.includes(loc.scale as Scale)) {
    throw new EvidenceFormError(`Give the locator's scale: ${SCALES.join(', ')}.`);
  }
  for (const k of ['table', 'row', 'column']) {
    if (loc[k] !== undefined && (typeof loc[k] !== 'string' || (loc[k] as string).trim() === '')) {
      throw new EvidenceFormError(`The locator's ${k}, when given, names it in words.`);
    }
  }
  needHowRead();
  const locator: Locator = { document: loc.document.trim(), value: loc.value, scale: loc.scale as Scale };
  for (const k of ['table', 'row', 'column'] as const) if (typeof loc[k] === 'string') locator[k] = (loc[k] as string).trim();
  return { evidenceForm: 'locator', quoteText: null, locator, howRead };
}
