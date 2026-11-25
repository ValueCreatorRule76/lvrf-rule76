// S7a (LVRF_PLAN §33 D6): the ruled wording for a published figure's class (Brad, 25 Nov 2026: §27's table, with his two
// changes). The one source: S7b's story reads it; client/src/lib/figureClass.ts must equal it word for word (Gate A).
export const FIGURE_CLASSES = [
  { value: 'license_count', label: 'License count',
    can: 'how many seats were bought, and when, as the publisher states',
    cannot: 'use, adoption, or any outcome' },
  { value: 'activity_count', label: 'Activity count',
    can: "that the activity was recorded in the stated period, by the publisher's system",
    cannot: 'capability change, a business outcome, or a rate per person, unless a headcount is cited from the same source' },
  { value: 'adjective', label: 'Adjective',
    can: 'that the publisher described it so',
    cannot: 'any figure' },
  { value: 'outcome_without_baseline', label: 'Outcome without baseline',
    can: 'the after-figure the publisher states',
    cannot: 'a change, or what caused it' },
  { value: 'outcome_with_baseline', label: 'Outcome with baseline',
    can: "the change the publisher states, as the publisher's claim",
    cannot: 'attribution to the learning, unless the publication states a method that can be checked' },
] as const;
export type FigureClass = (typeof FIGURE_CLASSES)[number]['value'];
export const isFigureClass = (v: unknown): v is FigureClass => FIGURE_CLASSES.some((c) => c.value === v);

/** The route's words, the database's (lvrf_evidence_final), before writing. */
export const FIGURE_CLASS_REQUIRED = 'A vendor publication about another account says what kind of figure it gives.';
export const FIGURE_CLASS_REFUSED = 'Only a vendor publication or a public filing about another account says what kind of figure it gives.';
export const FIGURE_CLASS_UNKNOWN = 'Choose what kind of figure it gives: a license count, an activity count, an adjective, an outcome without baseline, or an outcome with baseline.';

/** Whether a class is required, allowed, or refused for a source of this kind on this account (§33 D2). */
export function figureClassRule(kind: string, ownCompany: boolean): 'required' | 'optional' | 'refused' {
  if (ownCompany) return 'refused';
  if (kind === 'vendor_publication') return 'required';
  if (kind === 'public_filing') return 'optional';
  return 'refused';
}

/**
 * The class a request gives, read against §33 D2: { value } to write (null when none is given and none is needed), or
 * { refuse } with the sentence to answer before writing. Both evidence routes call it.
 */
export async function readFigureClass(client: { query: <T>(q: string, v: unknown[]) => Promise<{ rows: T[] }> },
  raw: unknown, kind: string, institutionId: string): Promise<{ value: FigureClass | null } | { refuse: string }> {
  const given = raw === undefined || raw === null || raw === '' ? null : raw;
  if (given !== null && !isFigureClass(given)) return { refuse: FIGURE_CLASS_UNKNOWN };
  const { rows: [inst] } = await client.query<{ own: boolean }>('SELECT is_tenant_self AS own FROM institutions WHERE id = $1', [institutionId]);
  const rule = figureClassRule(kind, Boolean(inst?.own));
  if (rule === 'required' && given === null) return { refuse: FIGURE_CLASS_REQUIRED };
  if (rule === 'refused' && given !== null) return { refuse: FIGURE_CLASS_REFUSED };
  return { value: given as FigureClass | null };
}
export const figureClassLabel = (v: string) => FIGURE_CLASSES.find((c) => c.value === v)?.label.toLowerCase() ?? v;
