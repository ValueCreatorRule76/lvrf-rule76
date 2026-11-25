// S7a (LVRF_PLAN §33 D6): the form's copy of server/lib/figureClass.ts, word for word (Gate A compares them).
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


/** Whether a class is required, allowed, or refused for a source of this kind on this account (§33 D2). */
export function figureClassRule(kind: string, ownCompany: boolean): 'required' | 'optional' | 'refused' {
  if (ownCompany) return 'refused';
  if (kind === 'vendor_publication') return 'required';
  if (kind === 'public_filing') return 'optional';
  return 'refused';
}
export const figureClassLabel = (v: string) => FIGURE_CLASSES.find((c) => c.value === v)?.label.toLowerCase() ?? v;
