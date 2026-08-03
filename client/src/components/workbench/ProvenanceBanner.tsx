import type { Run } from '../../types/run';

// Deliberately outside the record's frame — rendered above Rail, Topbar and
// Gate, not as a card within main. Provenance isn't a record status; it's
// whether anything on the page is real, which is prior to the title, the
// actions and the gate.
//
// A third visual register, not a variant of either of Gate's two: no ink
// fill (that means REFUSED here), no gold border with a check (that means
// CLEARED here). Full-bleed, unfilled, heavy rules top and bottom, display
// type at size — reads as a watermark framing the page, not a status card
// reporting on it.
export function ProvenanceBanner({ run }: { run: Run }) {
  const p = run.payload;

  // Absent on runs walked before this field existed — not back-filled.
  if (!p.note) return null;

  return (
    <section role="note" className="border-y-[3px] border-silver px-[30px] py-4">
      <p className="m-0 font-display text-[26px] leading-none tracking-[.05em] text-ink">
        {p.bannerTitle ?? 'PROVENANCE'}
      </p>
      <p className="m-0 mt-2 max-w-[110ch] text-[12.5px] text-ink-70">{p.note}</p>
    </section>
  );
}
