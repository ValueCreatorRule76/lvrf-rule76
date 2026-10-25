import { day } from '../lib/workspaceStatus';
import { locatorText } from '../lib/labels';

/**
 * P1 (LVRF_PLAN §8, item 5): what a piece of evidence rests on, shown the
 * same way everywhere — on screen and in print:
 *   a quote    — in quotation marks, then "How it was read: …";
 *   a locator  — "Document · table · row · column: value (scale)", then how it was read;
 *   a statement — "Stated by <name>, <date>";
 *   legacy     — "Recorded before evidence forms (24 Oct 2026)".
 * And a figure check that flagged, or could not check a statement, as one
 * line beside the figure: "Figure check: 1.4 is not in the quote (it states
 * 1.42)". A passing check adds no line.
 */

export interface EvidenceFormShown {
  evidence_form: string;
  quote_text: string | null;
  locator: { document: string; value: number; scale: string; table?: string; row?: string; column?: string } | null;
  how_read: string | null;
}
export interface FigureCheckShown { result: string; detail: string }


export function EvidenceRestsOn({ e, statedBy, statedOn, className = '' }: {
  e: EvidenceFormShown; statedBy?: string | null; statedOn?: string | null; className?: string;
}) {
  const base = 'text-[11px] text-ink-45 ' + className;
  if (e.evidence_form === 'quote' && e.quote_text) {
    return (
      <span className={'block ' + base} data-testid="evidence-rests-on" data-form="quote">
        <span className="text-ink-70">“{e.quote_text}”</span>
        {e.how_read && <span className="block">How it was read: {e.how_read}</span>}
      </span>
    );
  }
  if (e.evidence_form === 'locator' && e.locator) {
    return (
      <span className={'block ' + base} data-testid="evidence-rests-on" data-form="locator">
        <span className="text-ink-70 [overflow-wrap:anywhere]">{locatorText(e.locator)}</span>
        {e.how_read && <span className="block">How it was read: {e.how_read}</span>}
      </span>
    );
  }
  if (e.evidence_form === 'statement') {
    return (
      <span className={'block ' + base} data-testid="evidence-rests-on" data-form="statement">
        Stated by {statedBy ?? 'a named person'}{statedOn ? `, ${day(statedOn)}` : ''}
      </span>
    );
  }
  return <span className={'block ' + base} data-testid="evidence-rests-on" data-form="legacy">Recorded before evidence forms (24 Oct 2026)</span>;
}

/** `of` names the figure when the line sits apart from it (an outcome's baseline, actual or impact basis). */
export function FigureCheckLine({ check, of, className = '' }: { check: FigureCheckShown | null | undefined; of?: string; className?: string }) {
  if (!check || check.result === 'pass') return null;
  return (
    <span className={'block text-[11px] ' + (check.result === 'flag' ? 'text-gold-ink' : 'text-ink-45') + ' ' + className}
      data-testid="figure-check" data-result={check.result}>
      Figure check{of ? ` (${of})` : ''}: {check.detail}
    </span>
  );
}
