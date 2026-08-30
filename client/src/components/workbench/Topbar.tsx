import type { Run } from '../../types/run';
import { GovernedAction } from '../GovernedAction';

interface RecordDocumentResponse {
  record_document_id: string;
  document_version: number;
  disclosure: string;
  content_hash: string;
}

const ACTOR_REQUIRED_NOTE = 'Select who is acting before writing.';

export function Topbar({ run }: { run: Run }) {
  const verified = run.payload.realization === 'verified';

  // Refused locally, before ever posting, for exactly the two reasons
  // POST /api/value-runs/:id/record-document itself would refuse with —
  // saying so up front beats a round trip to hear the same thing back.
  // Checked in the endpoint's own order: unlocked (409) before missing
  // valueOutcomeId (422).
  const recordDocumentDisabledReason =
    run.locked_at === null
      ? 'Blocked: run is not locked'
      : typeof run.payload.valueOutcomeId !== 'string'
        ? 'Blocked: this run predates valueOutcomeId and cannot produce a record document'
        : undefined;

  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-rule bg-white px-[30px] py-[15px]">
      <p className="m-0 text-xs text-ink-45">
        <b className="font-semibold text-ink">{run.payload.engagement}</b>
      </p>
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled
          title="Evidence entry exists (card 01A, below) but is not wired to this button yet."
          className="border border-silver px-[15px] py-[7px] text-xs font-semibold tracking-[.04em] text-ink-25 cursor-not-allowed"
        >
          Add evidence
        </button>
        <GovernedAction<RecordDocumentResponse>
          label="Render record"
          path={`/api/value-runs/${run.id}/record-document`}
          actorRequiredNote={ACTOR_REQUIRED_NOTE}
          disabledReason={recordDocumentDisabledReason}
          renderSuccess={(data) => (
            <p className="m-0">
              Record document v{data.document_version} created. The row is the document of
              record; a rendered PDF is a rendering of it.
              <br />
              <span className="font-mono text-[11px] text-ink-45">{data.content_hash}</span>
            </p>
          )}
        />
        <button
          type="button"
          disabled={!verified}
          title={verified ? undefined : 'Blocked: outcome is not verified'}
          className="border border-silver px-[15px] py-[7px] text-xs font-semibold tracking-[.04em] text-ink-25 disabled:cursor-not-allowed enabled:border-ink enabled:text-ink enabled:hover:bg-ink enabled:hover:text-offwhite"
        >
          Share with customer
        </button>
      </div>
    </div>
  );
}
