/** S3 (LVRF_PLAN §22): the print family's constants and helpers, apart from its components (PrintFamily.tsx). */

/** A CSS string literal: the record line is set as a margin box's `content`, so it is escaped as CSS, not HTML. */
export function cssString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\A ') + '"';
}

/** The kicker on paper: Barlow Condensed (CLAUDE.md's condensed face), in --gold-ink (AMENDMENT-004: small gold text on light). */
export const KICKER_PRINT = 'print:font-condensed print:text-[8pt] print:font-semibold print:tracking-[.2em] print:text-gold-ink';

/**
 * The bottom margins that hold a record line of these lines, in points: the body pages' and the cover's. The record line
 * is set at 7pt Barlow Condensed, about 2.8pt a character and 3.2pt a hex digit, 9.75pt a line (measured, 19 Nov 2026);
 * it wraps at about 430pt on a body page and 390pt on the cover, where "Page 1 of N" shares the band. Never smaller
 * than the page's own margin (0.75in body, 0.6in cover), so a one-line record line prints as before.
 */
export function recordLineFeet(lines: string[]): { body: number; cover: number } {
  const width = (l: string) => { const hex = (l.match(/[0-9a-f]{64}/g) ?? []).length * 64; return (l.length - hex) * 2.8 + hex * 3.2; };
  const rows = (w: number) => lines.reduce((n, l) => n + Math.max(1, Math.ceil(width(l) / w)), 0);
  return { body: Math.max(54, rows(430) * 9.75 + 26), cover: Math.max(43.2, rows(390) * 9.75 + 26) };
}

export const TAGLINE = 'Rule 76 — No Excuses. Play Like A Champion.';
