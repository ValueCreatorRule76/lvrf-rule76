import { day } from '../lib/workspaceStatus';

/**
 * C3b (Brad, 27 Oct 2026) — two readings of the record, shown wherever the item appears. Neither changes anything.
 *
 * A figure's finding: a steward recorded that it has no source on record (figure_findings). The text is the
 * server's, from the record; it says "no source on record", never "invented".
 */
export interface FigureFinding { field: string; value: string; finding_text: string; recorded_by: string; recorded_on: string }

export function NoSourceLine({ finding, className = '' }: { finding: FigureFinding; className?: string }) {
  return (
    <span className={'block text-[11.5px] text-warning [overflow-wrap:anywhere] ' + className} data-testid="no-source-line">
      <span className="font-semibold">No source on record</span> — found by {finding.recorded_by}, {day(finding.recorded_on)}. {finding.finding_text}
    </span>
  );
}

/** Brad's condition 2: an evidence row verified with no citation opened, read from the row as it stands. */
export function VerifiedUnopenedLine({ className = '' }: { className?: string }) {
  return (
    <span className={'block text-[11px] text-warning ' + className} data-testid="verified-unopened">
      verified without the source being opened
    </span>
  );
}
