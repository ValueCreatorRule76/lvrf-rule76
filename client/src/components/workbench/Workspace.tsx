import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS_RING } from '../GovernedForm';

/**
 * UX-1 slice 1 — the account workspace's pieces (DESIGN_SPEC §9, "UX-1
 * standards"). In the existing library on purpose (§0b: no second one).
 *
 *   ConfidenceBadge  standard 5: "n / 100 · Band", Low neutral (ink-70),
 *                    Medium gold-ink, High healthy; never critical red.
 *   WorkspaceStep    standard 2: one of the six steps. Done folds to one line
 *                    with "Show ▸"; the open step shows its body; a waiting
 *                    step says what it waits for. A folded step's body stays
 *                    MOUNTED (hidden), so every form keeps its state and the
 *                    verify scripts still find it; "Show ▸" opens any step
 *                    (standard 3: the order is guidance, not a gate).
 *   StepRail         where you are, at desktop width only (dropped at 390).
 */

export type StepStatus = 'done' | 'now' | 'wait';

export function ConfidenceBadge({ score, band }: { score: string | number | null; band: string | null }) {
  if (score === null || band === null) return <span className="text-[12.5px] text-ink-45">No locked run yet: nothing to score.</span>;
  const tone = band === 'high' ? 'border-healthy text-healthy' : band === 'medium' ? 'border-gold-ink text-gold-ink' : 'border-ink-70 text-ink-70';
  const label = band.charAt(0).toUpperCase() + band.slice(1);
  return (
    <span className={'inline-block whitespace-nowrap border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.1em] ' + tone} data-testid="confidence-badge">
      {Number(score)} / 100 · {label}
    </span>
  );
}

/** The band alone, in the same tones (the Book confidence card's big numeral carries the score). */
export function BandBadge({ band }: { band: string }) {
  const tone = band === 'high' ? 'border-healthy text-healthy' : band === 'medium' ? 'border-gold-ink text-gold-ink' : 'border-ink-70 text-ink-70';
  return <span className={'inline-block whitespace-nowrap border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.1em] ' + tone}>{band.charAt(0).toUpperCase() + band.slice(1)}</span>;
}

export function WorkspaceStep({ n, title, status, summary, children, testId }: {
  n: number; title: string; status: StepStatus; summary?: ReactNode; children?: ReactNode; testId: string;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? status === 'now';
  const tone = status === 'done' ? 'text-healthy' : status === 'now' ? 'text-gold' : 'text-ink-25';
  return (
    <section
      className={'mb-2.5 border bg-white ' + (status === 'now' ? 'border-ink shadow-[inset_4px_0_0_theme(colors.gold)]' : 'border-rule')}
      data-testid={testId} data-step={n} data-status={status} data-open={isOpen ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-3">
        <span className={'w-5 font-display text-[22px] leading-none ' + tone}>{n}</span>
        <h3 className={'m-0 whitespace-nowrap text-[15px] ' + (status === 'wait' ? 'font-medium text-ink-45' : 'font-semibold text-ink')}>{title}</h3>
        {status === 'now' && <span className="bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-offwhite">Next</span>}
        {/* An open step shows its body, not its one-line summary (no saying it twice). */}
        {summary && <span className={'min-w-0 flex-1 basis-full text-[13px] text-ink-45 sm:basis-auto ' + (isOpen ? 'hidden' : '')}>{summary}</span>}
        <button type="button" data-step-toggle onClick={() => setOpen(!isOpen)}
          className={'ml-auto whitespace-nowrap text-[12.5px] text-ink-45 hover:text-ink ' + FOCUS_RING} aria-expanded={isOpen}>
          {isOpen ? 'Hide ▴' : 'Show ▸'}
        </button>
      </div>
      {/* Folded: hidden (out of the layout and the accessibility tree) and inert
          (no focus, no keyboard), but mounted, so its forms keep their state. */}
      <div hidden={!isOpen} inert={!isOpen} className="px-[18px] pb-5 pt-1 sm:pl-[52px]" data-testid={`${testId}-body`}>{children}</div>
    </section>
  );
}

export function StepRail({ steps }: { steps: { n: number; title: string; status: StepStatus }[] }) {
  return (
    <ol className="sticky top-4 m-0 hidden list-none self-start p-0 sm:block" aria-label="The path" data-testid="step-rail">
      {steps.map((s) => (
        <li key={s.n} className={'flex items-baseline gap-2.5 border-b border-rule-soft py-2 text-[13.5px] ' + (s.status === 'now' ? 'font-semibold text-ink' : s.status === 'done' ? 'text-ink-70' : 'text-ink-45')}>
          <span className={'w-4 font-display text-[18px] ' + (s.status === 'done' ? 'text-healthy' : s.status === 'now' ? 'text-gold' : 'text-ink-25')}>{s.n}</span>
          <span>{s.title}</span>
          <span className={'ml-auto text-[10.5px] font-semibold uppercase tracking-[.08em] ' + (s.status === 'done' ? 'text-healthy' : 'text-ink')}>
            {s.status === 'done' ? 'Done' : s.status === 'now' ? 'Now' : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A hint the open step passes down: which action is THE filled one. */
export function PrimaryLink({ href, children, primary }: { href: string; children: ReactNode; primary: boolean }) {
  return (
    <Link to={href} data-primary={primary ? 'true' : undefined}
      className={'inline-flex items-center gap-2 border px-4 py-2 text-[12px] font-semibold tracking-[.04em] no-underline ' +
        (primary ? "border-ink bg-ink text-offwhite hover:bg-ink-70 after:ml-2 after:text-gold after:content-['→']" : 'border-ink bg-white text-ink hover:bg-offwhite') + ' ' + FOCUS_RING}>
      {children}
    </Link>
  );
}
