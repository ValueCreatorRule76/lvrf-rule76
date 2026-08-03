import type { Run } from '../../types/run';

// Not a styling choice: a product whose thesis is refusing to overclaim
// should make the refusal look like one. Verified gets the gold-bordered
// "cleared" treatment; anything else gets a solid ink bar with no gold at
// all — no yellow toast standing in for a hard refusal.
export function Gate({ run }: { run: Run }) {
  const p = run.payload;
  const verified = p.realization === 'verified';

  if (verified) {
    return (
      <section
        role="status"
        className="flex items-start gap-5 border-b-[3px] border-gold bg-ink px-[30px] py-[15px] text-offwhite"
      >
        <span aria-hidden="true" className="font-display text-3xl leading-none text-gold">
          ✓
        </span>
        <div>
          <h2 className="m-0 mb-[3px] font-display text-lg tracking-[.07em] text-gold">
            Verification cleared — {p.disclosure.replace('_', ' ')}
          </h2>
          <p className="m-0 max-w-[66ch] text-[12.5px] text-offwhite/[.82]">
            Realization is <strong>verified</strong>. Computed confidence is{' '}
            <strong>
              {p.confidence.score}/100 ({p.confidence.band.toUpperCase()})
            </strong>
            . Attested evidence earns partial credit, so a record of this shape cannot exceed 80
            without independent verification — that ceiling is deliberate.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      role="status"
      className="flex items-start gap-5 border-b-[3px] border-ink bg-ink px-[30px] py-[15px] text-offwhite"
    >
      <span aria-hidden="true" className="font-display text-3xl leading-none text-offwhite">
        ✕
      </span>
      <div>
        <h2 className="m-0 mb-[3px] font-display text-lg tracking-[.07em] text-offwhite">
          Verification refused — record is {p.disclosure.replace('_', ' ')}
        </h2>
        <p className="m-0 max-w-[66ch] text-[12.5px] text-offwhite/[.82]">
          Realization holds at <strong>{p.realization}</strong>. Computed confidence is{' '}
          <strong>
            {p.confidence.score}/100 ({p.confidence.band.toUpperCase()})
          </strong>
          . <code className="bg-white/10 px-1 font-mono text-[11px]">
            value_outcomes_verified_requires_human
          </code>{' '}
          will reject any attempt to force this. Sharing is disabled until a named human verifier
          confirms sources.
        </p>
      </div>
    </section>
  );
}
