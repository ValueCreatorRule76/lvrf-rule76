import { useState } from 'react';
import { FOCUS_RING } from './GovernedForm';
import { FIGURE_CLASSES, figureClassRule } from '../lib/figureClass';

/**
 * S7a (LVRF_PLAN §33 D5, the mock-up approved by Brad 25 Nov 2026): "What kind of figure it gives", on a published
 * source. Shown only for a vendor publication (required) or a public filing (optional) on an account that is not your
 * own company's (D2); under it, how a story reads the chosen class, in the ruled wording (D6), and that it is fixed.
 */
const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

export interface FigureClassForm {
  fields: React.ReactNode;
  unmet: string[];
  body: () => Record<string, unknown>;
  /** For the confirmation: the class and its two lines, or nothing when none is chosen. */
  confirm: { label: string; value: string } | null;
}

export function useFigureClass(kind: string, ownCompany: boolean): FigureClassForm {
  const [value, setValue] = useState('');
  const rule = figureClassRule(kind, ownCompany);
  const chosen = FIGURE_CLASSES.find((c) => c.value === value) ?? null;
  if (rule === 'refused') return { fields: null, unmet: [], body: () => ({}), confirm: null };
  const fields = (
    <label className="block" data-testid="figure-class">
      <span className={L}>What kind of figure it gives{rule === 'optional' ? ' (optional for a public filing)' : ''}</span>
      <select className={I} value={value} onChange={(e) => setValue(e.target.value)} data-testid="figure-class-select">
        <option value="">{rule === 'optional' ? '— none —' : '— choose —'}</option>
        {FIGURE_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      {chosen && (
        <span className="mt-1.5 block text-[12px] leading-snug" data-testid="figure-class-reads">
          <span className={L}>A story reads it so</span>
          <span className="block text-healthy" data-testid="figure-class-can">It can support: {chosen.can}.</span>
          <span className="block text-critical" data-testid="figure-class-cannot">It cannot support: {chosen.cannot}.</span>
          <span className="block text-ink-70">It is fixed when recorded: a correction supersedes the row.</span>
        </span>)}
    </label>
  );
  return {
    fields,
    unmet: rule === 'required' && !chosen ? ['choose what kind of figure it gives'] : [],
    body: () => (chosen ? { published_figure_class: chosen.value } : {}),
    confirm: chosen ? { label: 'What kind of figure it gives', value: `${chosen.label}. It can support: ${chosen.can}. It cannot support: ${chosen.cannot}.` } : null,
  };
}
