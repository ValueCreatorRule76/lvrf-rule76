import { IndustriesListCard } from '../components/IndustriesListCard';

// The packs entry point. IndustriesListCard moved here from RunsIndexPage
// — it was the packs entry point sitting on a page about runs. It keeps
// its own n="00"; it is now the only card on its page, same as
// AccountsIndexPage's table and RunsIndexPage's (now sole) table.
export function PacksIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF
        </span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
          Packs
        </h1>
      </header>

      <IndustriesListCard />
    </div>
  );
}
