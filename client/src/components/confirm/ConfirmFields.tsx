import type { ReactNode } from 'react';

/**
 * S4 (3.1; LVRF_PLAN §23; Brad, 15 and 19 Nov 2026): a steward form confirms every field in full before it records.
 * Each field by its form label, with the value exactly as it will be sent (whitespace kept; no slice, no ellipsis)
 * and its character count, so a cut-off paste (c56a3d33: 340 of 557 characters) shows before it is recorded.
 * A warning (D2: a summary that repeats the quote) is shown and may be confirmed.
 */
export interface ConfirmField { label: string; value: string | null | undefined }

export function ConfirmFields({ lead, fields, warnings = [], tail }: { lead: ReactNode; fields: ConfirmField[]; warnings?: string[]; tail?: ReactNode }) {
  return (
    <span className="block" data-testid="confirm-text">
      <span className="block" data-testid="confirm-lead">{lead}</span>
      <span className="mt-2 block border-l-[3px] border-rule pl-3" data-testid="confirm-fields">
        {fields.map((f) => {
          const v = f.value ?? '';
          return (
            <span key={f.label} className="mb-2 block" data-testid="confirm-field" data-label={f.label}>
              <span className="block text-[10px] font-semibold uppercase tracking-[.14em] text-ink-45">
                {f.label} <span className="font-normal normal-case tracking-normal" data-testid="confirm-count">({v === '' ? 'none' : `${[...v].length} characters`})</span>
              </span>
              <span className="block whitespace-pre-wrap break-words text-[12.5px] text-ink" data-testid="confirm-value">{v === '' ? '—' : v}</span>
            </span>
          );
        })}
      </span>
      {warnings.map((w) => (
        <span key={w} className="mt-1 block border-l-[3px] border-warning pl-3 text-[12.5px] font-semibold text-warning" data-testid="confirm-warning">{w}.</span>
      ))}
      {tail && <span className="mt-1 block" data-testid="confirm-tail">{tail}</span>}
    </span>
  );
}
