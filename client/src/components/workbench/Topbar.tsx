import type { Run } from '../../types/run';

export function Topbar({ run }: { run: Run }) {
  const verified = run.payload.realization === 'verified';

  return (
    <div className="flex flex-wrap items-center justify-between gap-5 border-b border-rule bg-white px-[30px] py-[15px]">
      <p className="m-0 text-xs text-ink-45">
        <b className="font-semibold text-ink">{run.payload.engagement}</b>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled
          title="Not yet implemented"
          className="border border-silver px-[15px] py-[7px] text-xs font-semibold tracking-[.04em] text-ink-25 cursor-not-allowed"
        >
          Add evidence
        </button>
        <button
          type="button"
          disabled
          title="Not yet implemented"
          className="border border-silver px-[15px] py-[7px] text-xs font-semibold tracking-[.04em] text-ink-25 cursor-not-allowed"
        >
          Render record
        </button>
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
