import type { PoolClient } from 'pg';

/**
 * P1 (LVRF_PLAN §8, item 3) — THE FIGURE CHECK. Deterministic, rules_version 1.
 *
 * Every figure written with evidence is compared with that evidence:
 *   - the numbers in the value must appear in the quote, read with its commas
 *     and scale words ("3,413.1 million", "5,200", "1.42", "12%"), at the
 *     precision the source states — "3,413.1 million" matches 3,413,100,000;
 *   - for a locator, the value must equal the located value × its scale;
 *   - qualifiers in a text value that the quote lacks are wording flags.
 * A number in the value the evidence lacks is a flag, named: "1.4 is not in
 * the quote (it states 1.42)". A person's statement backing a figure is "not
 * checkable", never a pass (Brad, 24 Oct 2026).
 *
 * It never blocks a write (the verification state that acts on a flag is P3):
 * it is recorded in figure_checks, and the figure shows it. Nothing here is a
 * model or a heuristic score — the same inputs give the same result.
 */
export const FIGURE_RULES_VERSION = 1;

/** The qualifiers rules v1 looks for in a text value (LVRF_PLAN §8). */
export const QUALIFIERS = ['approximately', 'up to', 'at least', 'estimated', 'adjusted', 'excluding', 'including', 'over'] as const;

export type Scale = 'units' | 'thousands' | 'millions' | 'billions' | 'percent';
export const SCALE_FACTOR: Record<Scale, number> = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9, percent: 1 };
export interface Locator { document: string; value: number; scale: Scale; table?: string; row?: string; column?: string }

export type EvidenceForm = 'quote' | 'locator' | 'statement';
export interface Evidence { form: EvidenceForm; quoteText: string | null; locator: Locator | null }

export interface CheckResult {
  numbersInValue: string[];
  numbersFound: string[];
  numbersMissing: string[];
  wordingFlags: string[];
  result: 'pass' | 'flag' | 'not_checkable';
  /** The sentence shown after "Figure check: ", on screen and in print. */
  detail: string;
}

interface Stated { raw: string; value: number; tolerance: number }

const WORD_SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12, mn: 1e6, bn: 1e9 };
const LETTER_SCALE: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** The numbers a text states, each with the precision it states them at. */
export function statedNumbers(text: string): Stated[] {
  const out: Stated[] = [];
  const re = /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:(%)|\s*(thousand|million|billion|trillion|mn|bn)s?\b|(K|M|B)\b)?/g;
  for (const m of text.matchAll(re)) {
    const base = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
    if (!Number.isFinite(base)) continue;
    const scale = m[4] ? WORD_SCALE[m[4].toLowerCase()] : m[5] ? LETTER_SCALE[m[5]] : 1;
    const decimals = m[2] ? m[2].length : 0;
    out.push({ raw: m[0].trim(), value: base * scale, tolerance: 0.5 * 10 ** -decimals * scale });
  }
  return out;
}

const shown = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 20 });
const exact = (n: number) => String(n);
const matches = (v: number, s: Stated) => Math.abs(v - s.value) <= s.tolerance + 1e-9 * Math.max(1, Math.abs(v));

/**
 * Check a figure against its evidence. `numeric` is a numeric value (a fact's
 * value_numeric, an outcome's figure); `text` is a text value (a fact's
 * value_text), whose own numbers and qualifiers are checked.
 */
export function checkFigure(value: { numeric: number | null; text: string | null }, ev: Evidence): CheckResult {
  // label: as recorded (exact); display: as a reader sees it in the sentence.
  const numbers: { v: number; label: string; display: string }[] = value.numeric !== null
    ? [{ v: value.numeric, label: exact(value.numeric), display: shown(value.numeric) }]
    : statedNumbers(value.text ?? '').map((s) => ({ v: s.value, label: s.raw, display: s.raw }));
  const numbersInValue = numbers.map((n) => n.label);
  if (ev.form === 'statement') {
    return { numbersInValue, numbersFound: [], numbersMissing: [], wordingFlags: [], result: 'not_checkable', detail: "not checkable: the evidence is a person's statement" };
  }

  const stated: Stated[] = ev.form === 'quote'
    ? statedNumbers(ev.quoteText ?? '')
    : (() => {
        const l = ev.locator!;
        const decimals = (String(l.value).split('.')[1] ?? '').length;
        const f = SCALE_FACTOR[l.scale];
        return [{ raw: `${l.value} ${l.scale}`, value: l.value * f, tolerance: 0.5 * 10 ** -decimals * f }];
      })();

  const numbersFound: string[] = [];
  const numbersMissing: string[] = [];
  const missingShown: string[] = [];
  const foundAs: string[] = [];
  for (const n of numbers) {
    const hit = stated.find((s) => matches(n.v, s));
    if (hit) { numbersFound.push(`${n.label} = ${hit.raw}`); foundAs.push(hit.raw); } else { numbersMissing.push(n.label); missingShown.push(n.display); }
  }

  const wordingFlags: string[] = [];
  if (value.text) {
    const has = (t: string, q: string) => new RegExp(`(^|[^a-z])${q.replace(/ /g, '\\s+')}([^a-z]|$)`, 'i').test(t);
    for (const q of QUALIFIERS) if (has(value.text, q) && !(ev.form === 'quote' && has(ev.quoteText ?? '', q))) wordingFlags.push(q);
  }

  const states = ev.form === 'quote'
    ? (stated.length === 0 ? 'it states no number' : `it states ${stated.slice(0, 3).map((s) => s.raw).join(', ')}`)
    : `it reads ${stated[0].raw}`;
  const sentences: string[] = [];
  for (const m of missingShown) sentences.push(ev.form === 'quote' ? `${m} is not in the quote (${states})` : `${m} does not match the located value (${states})`);
  for (const w of wordingFlags) sentences.push(`"${w}" is in the value but not in ${ev.form === 'quote' ? 'the quote' : 'the locator'}`);
  if (sentences.length === 0) {
    sentences.push(numbers.length === 0
      ? `no number in the value, and no qualifier the ${ev.form === 'quote' ? 'quote' : 'locator'} lacks`
      : ev.form === 'quote'
        ? `${numbers.map((n) => n.display).join(', ')} ${numbers.length === 1 ? 'is' : 'are'} in the quote (${foundAs.join(', ')})`
        : `${numbers.map((n) => n.display).join(', ')} ${numbers.length === 1 ? 'matches' : 'match'} the located value (${foundAs.join(', ')})`);
  }
  const result: CheckResult['result'] = numbersMissing.length === 0 && wordingFlags.length === 0 ? 'pass' : 'flag';
  return { numbersInValue, numbersFound, numbersMissing, wordingFlags, result, detail: sentences.join('; ') };
}

/** Record a check, on the request's client (it never blocks the write it checks). */
export async function recordFigureCheck(
  client: PoolClient,
  row: {
    institutionId: string; evidenceId: string;
    subjectTable: 'institution_facts' | 'value_outcomes'; subjectId: string;
    subjectField: 'value_numeric' | 'value_text' | 'baseline_value' | 'actual_value' | 'claimed_currency_impact';
    valueChecked: string | null; actorPersonId: string;
  },
  r: CheckResult,
): Promise<string> {
  const { rows: [created] } = await client.query<{ id: string }>(
    `INSERT INTO figure_checks (institution_id, evidence_id, subject_table, subject_id, subject_field, value_checked,
       numbers_in_value, numbers_found, numbers_missing, wording_flags, result, detail, rules_version, checked_by_person_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [row.institutionId, row.evidenceId, row.subjectTable, row.subjectId, row.subjectField, row.valueChecked,
      JSON.stringify(r.numbersInValue), JSON.stringify(r.numbersFound), JSON.stringify(r.numbersMissing), JSON.stringify(r.wordingFlags),
      r.result, r.detail, FIGURE_RULES_VERSION, row.actorPersonId],
  );
  return created.id;
}
