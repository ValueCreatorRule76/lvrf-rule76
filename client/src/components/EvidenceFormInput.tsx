import { useState, type ReactNode } from 'react';
import { FOCUS_RING } from './GovernedForm';

/**
 * P1 (LVRF_PLAN §8): what a piece of evidence rests on, entered the same way
 * in every form that records evidence — the outcome evidence form, the
 * typed fact and its correction, an entity correction, and a research
 * accept that the contract left short.
 *
 *   quote     — the source's own words (at most 40), and how the value was read;
 *   locator   — the document, the value as it appears there and its scale
 *               (table, row and column when it has them), and how it was read;
 *   statement — a person's own word: an observation citing no source, or an
 *               attestation (Brad, 24 Oct 2026), where the form allows it.
 * The server reads the same body (server/lib/evidenceFormBody.ts) and the
 * database holds the same shape, so the unmet list here is guidance, never
 * the only guard.
 */

export type EvidenceFormChoice = 'quote' | 'locator' | 'statement';
export const QUOTE_MAX_WORDS = 40;
export const HOW_READ_MIN = 24;
const SCALES = [['units', 'Units'], ['thousands', 'Thousands'], ['millions', 'Millions'], ['billions', 'Billions'], ['percent', 'Percent']] as const;
const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const CHOICE_LABEL: Record<EvidenceFormChoice, string> = {
  quote: "A quote — the source's own words",
  locator: 'A locator — where in a document the value is',
  statement: "A person's statement",
};

export function useEvidenceForm(opts: {
  /** The forms this evidence may take here. */
  allowed: EvidenceFormChoice[];
  /** The evidence's kind and source reference, for the statement rule. */
  kind?: string;
  sourceReference?: string;
}): { fields: ReactNode; body: () => Record<string, unknown>; unmet: string[]; reset: () => void } {
  const [form, setForm] = useState<EvidenceFormChoice | ''>(opts.allowed.length === 1 ? opts.allowed[0] : '');
  const [quote, setQuote] = useState('');
  const [doc, setDoc] = useState('');
  const [table, setTable] = useState('');
  const [row, setRow] = useState('');
  const [column, setColumn] = useState('');
  const [value, setValue] = useState('');
  const [scale, setScale] = useState('');
  const [howRead, setHowRead] = useState('');
  const kind = opts.kind ?? '';
  const statementFits = kind === 'attestation' || (kind === 'observation' && !(opts.sourceReference ?? '').trim());

  const unmet: string[] = [];
  if (!form) {
    unmet.push(`say what the evidence rests on: ${opts.allowed.map((c) => (c === 'quote' ? 'a quote' : c === 'locator' ? 'a locator' : "a person's statement")).join(', or ')}`);
  } else if (form === 'statement') {
    if (!statementFits) unmet.push(kind === 'observation'
      ? 'an observation that cites a source rests on a quote or a locator, not a statement'
      : "a person's statement is an observation citing no source, or an attestation: choose a quote or a locator for this kind");
  } else {
    if (form === 'quote') {
      if (!quote.trim()) unmet.push("give the quote: the source's own words");
      else if (words(quote) > QUOTE_MAX_WORDS) unmet.push(`the quote is ${words(quote)} words; a quote is at most ${QUOTE_MAX_WORDS}`);
    } else {
      if (!doc.trim()) unmet.push('name the document the locator points into');
      if (value.trim() === '' || !Number.isFinite(Number(value))) unmet.push('give the located value as a number');
      if (!scale) unmet.push("choose the located value's scale");
    }
    if (howRead.trim().length < HOW_READ_MIN) unmet.push(`say how the value was read (${HOW_READ_MIN - howRead.trim().length} more characters)`);
  }

  const body = (): Record<string, unknown> => {
    if (form === 'statement') return { evidence_form: 'statement' };
    if (form === 'quote') return { evidence_form: 'quote', quote_text: quote.trim(), how_read: howRead.trim() };
    return {
      evidence_form: 'locator', how_read: howRead.trim(),
      locator: {
        document: doc.trim(), value: Number(value), scale,
        ...(table.trim() ? { table: table.trim() } : {}), ...(row.trim() ? { row: row.trim() } : {}), ...(column.trim() ? { column: column.trim() } : {}),
      },
    };
  };
  const reset = () => { setQuote(''); setDoc(''); setTable(''); setRow(''); setColumn(''); setValue(''); setScale(''); setHowRead(''); if (opts.allowed.length > 1) setForm(''); };

  const fields = (
    <div className="mb-3 flex flex-col gap-3 border-l-[3px] border-rule pl-3" data-testid="evidence-form-input">
      {opts.allowed.length > 1 && (
        <label className="block">
          <span className={LABEL}>What it rests on</span>
          <select className={INPUT} value={form} onChange={(e) => setForm(e.target.value as EvidenceFormChoice)} data-testid="evidence-form-choice">
            <option value="" disabled>— choose —</option>
            {opts.allowed.map((c) => <option key={c} value={c}>{CHOICE_LABEL[c]}</option>)}
          </select>
        </label>
      )}
      {form === 'quote' && (
        <label className="block">
          <span className={LABEL}>Quote (the source&apos;s own words, at most {QUOTE_MAX_WORDS})</span>
          <textarea rows={2} className={INPUT} value={quote} onChange={(e) => setQuote(e.target.value)} />
          <span className="mt-1 block text-[11px] text-ink-45">{words(quote)} of {QUOTE_MAX_WORDS} words</span>
        </label>
      )}
      {form === 'locator' && (
        <>
          <label className="block"><span className={LABEL}>Document</span>
            <input className={INPUT} value={doc} onChange={(e) => setDoc(e.target.value)} /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block"><span className={LABEL}>Table (if any)</span><input className={INPUT} value={table} onChange={(e) => setTable(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>Row (if any)</span><input className={INPUT} value={row} onChange={(e) => setRow(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>Column (if any)</span><input className={INPUT} value={column} onChange={(e) => setColumn(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className={LABEL}>Located value (as the document shows it)</span>
              <input inputMode="decimal" className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} /></label>
            <label className="block"><span className={LABEL}>Scale</span>
              <select className={INPUT} value={scale} onChange={(e) => setScale(e.target.value)}>
                <option value="" disabled>— choose —</option>
                {SCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
          </div>
        </>
      )}
      {(form === 'quote' || form === 'locator') && (
        <label className="block">
          <span className={LABEL}>How it was read (at least {HOW_READ_MIN} characters)</span>
          <textarea rows={2} className={INPUT} value={howRead} onChange={(e) => setHowRead(e.target.value)} />
          <span className="mt-1 block text-[11px] text-ink-45">What you read and where — not a restatement of the source.</span>
        </label>
      )}
      {form === 'statement' && (
        <p className="m-0 text-[11.5px] text-ink-45">Recorded as your statement, named and dated. A figure it backs is shown as not checkable: nothing in a statement can be compared with it.</p>
      )}
    </div>
  );
  return { fields, body, unmet, reset };
}
