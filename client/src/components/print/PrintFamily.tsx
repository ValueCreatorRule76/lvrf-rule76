import type { ReactNode } from 'react';
import { cssString, recordLineFeet, TAGLINE } from './printText';

/**
 * S3 (3.1; LVRF_PLAN §22, approved by Brad 19 Nov 2026) — the printed value case and POV in the CVAF family: CVAF's
 * printed business case is the pattern (an ink cover over paper pages), set in LVRF's tokens (CLAUDE.md). Print only:
 * every piece here is hidden on screen. Colours are tokens (Tailwind classes, theme() in index.css), never a hex.
 *
 *   PrintRecordLine  the document's record line, with the FULL hash, at the foot of EVERY page (the @page margin box,
 *                    so the last page's too), the cover's ink band included (Brad, 19 Nov 2026, changes 1 and 4)
 *   PrintCover       the ink cover: the very banners element every body page repeats (condition 1), the kicker, the
 *                    account and the document's name, the meta line, the gold rule, a lede, and a source line where
 *                    the banners point to page 1 (the POV's marker, C1b: its full citation prints on page 1)
 *   PrintStats       the stats row: Bebas display for measured numbers ONLY; a status or an absence prints at label size
 *                    (change 2)
 *   PrintClose       the last page: the disclaimer under its heading, then the Rule 76 tagline, smaller (change 3)
 */


/**
 * Sets the record line in the bottom-left margin box of every printed page, cover included. One per document. The
 * bottom margin grows with the record line (a POV names a hash per engagement), so no line of it is clipped; the
 * cover's height follows (--lvrf-cover-foot), so the cover stays one page.
 */
export function PrintRecordLine({ lines }: { lines: string[] }) {
  const content = cssString(lines.join('\n'));
  const foot = recordLineFeet(lines);
  return (
    <style data-testid="print-record-line" data-record-line={lines.join('\n')}>
      {`@page letter { margin-bottom: ${foot.body}pt; @bottom-left { content: ${content}; } } `
        + `@page lvrf-cover { margin-bottom: ${foot.cover}pt; @bottom-left { content: ${content}; } } `
        + `:root { --lvrf-cover-foot: ${foot.cover}pt; }`}
    </style>
  );
}


export function PrintCover({ banners, kicker, title, doc, meta, lede, source }: {
  banners: ReactNode; kicker: string; title: string; doc: string; meta: ReactNode; lede?: ReactNode; source?: ReactNode;
}) {
  return (
    <section className="hidden print:flex" data-testid="print-cover">
      <div data-testid="cover-banners">{banners}</div>
      <div className="flex flex-col text-offwhite" data-testid="cover-panel">
        <span className="font-condensed text-[9pt] font-semibold uppercase tracking-[.22em] text-gold" data-testid="cover-kicker">{kicker}</span>
        <h1 className="m-0 mt-[10pt] font-display text-[54pt] font-normal leading-[.92] tracking-[.01em] text-offwhite" data-testid="cover-title">
          {title}<span className="block text-gold" data-testid="cover-doc">{doc}</span>
        </h1>
        <p className="m-0 mt-[14pt] max-w-[5.6in] text-[10pt] leading-[1.5] text-silver" data-testid="cover-meta">{meta}</p>
        <span className="mt-[16pt] block w-[40pt] border-t-[1.6pt] border-gold" aria-hidden="true" />
        {lede && <p className="m-0 mt-[22pt] max-w-[5.6in] text-[12pt] leading-[1.45] text-offwhite" data-testid="cover-lede">{lede}</p>}
        {source && <p className="m-0 mt-[22pt] max-w-[6.4in] font-mono text-[9pt] leading-[1.5] text-silver [overflow-wrap:anywhere]" data-testid="print-marker-full">{source}</p>}
      </div>
    </section>
  );
}

/** A measured number prints in display; anything else (a status, an absence) at label size (Brad, change 2). */
/** A unit longer than this ("incidents per 200,000 hours") prints on its own line under the number, not beside it. */
const SHORT_UNIT = 8;
export interface PrintStat { label: string; number?: string | null; unit?: string | null; words?: string | null; note?: string | null }

export function PrintStats({ stats }: { stats: PrintStat[] }) {
  return (
    <div className="hidden border-b-[0.6pt] border-t-[1.2pt] border-b-rule border-t-ink print:my-[8pt] print:flex" data-testid="print-stats">
      {stats.map((s) => (
        <div key={s.label} className="flex-1 py-[7pt] pr-[8pt]" data-testid="print-stat">
          {s.number != null
            ? <>
                <div className="font-display text-[25pt] leading-none text-ink" data-testid="print-stat-number">{s.number}{s.unit && s.unit.length <= SHORT_UNIT ? <span className="font-body text-[9pt] text-ink-45"> {s.unit}</span> : null}</div>
                {s.unit && s.unit.length > SHORT_UNIT && <div className="mt-[2pt] text-[8pt] leading-[1.25] text-ink-45" data-testid="print-stat-unit">{s.unit}</div>}
              </>
            : <div className="font-condensed text-[9pt] font-semibold uppercase leading-[25pt] tracking-[.08em] text-ink-70" data-testid="print-stat-words">{s.words ?? 'not recorded'}</div>}
          <div className="mt-[3pt] font-condensed text-[7.2pt] font-semibold uppercase tracking-[.12em] text-ink-45">{s.label}</div>
          {s.note && <div className="mt-[2pt] text-[8pt] text-ink-45">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}


export function PrintClose({ heading, text }: { heading: string; text: string }) {
  return (
    <section className="hidden print:mt-[18pt] print:block print:border-t-[0.6pt] print:border-rule print:pt-[8pt]" data-testid="print-close">
      <h2 className="m-0 font-display text-[15pt] font-normal tracking-[.03em] text-ink" data-testid="close-heading">{heading}</h2>
      <p className="m-0 mt-[3pt] text-[8.6pt] leading-[1.45] text-ink-70" data-testid="close-disclaimer">{text}</p>
      <p className="m-0 mt-[8pt] font-condensed text-[8pt] font-semibold uppercase tracking-[.14em] text-gold-ink" data-testid="close-tagline">{TAGLINE}</p>
    </section>
  );
}
