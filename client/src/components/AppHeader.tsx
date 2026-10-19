import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ActorBar } from '../actor/ActorBar';
import { NavBar } from './NavBar';
import { FOCUS_RING } from './GovernedForm';

/**
 * UX-1 slice 2 — the header (DESIGN_SPEC §9, "UX-1 standards", standard 9).
 * From 640 px up it is exactly today's row: NavBar and ActorBar, untouched.
 * Below that, the two collapse behind ONE row with a real "Menu" button
 * (aria-expanded, aria-controls): no three-row stack, no sideways scroll. The
 * panel holds the same NavBar and ActorBar, so nothing they do changes. It
 * closes on navigation and on Escape.
 */
export function AppHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <div className="hidden flex-wrap items-stretch sm:flex" data-testid="header-desktop">
        <NavBar />
        <div className="min-w-[260px] flex-1">
          <ActorBar />
        </div>
      </div>
      <div className="sm:hidden" data-testid="header-phone">
        <div className="flex items-center justify-between border-b border-rule bg-white px-4 py-2.5">
          <span className="font-display text-[20px] leading-none tracking-[.06em] text-ink">LVRF</span>
          <button type="button" aria-expanded={open} aria-controls="phone-menu" onClick={() => setOpen(!open)} data-testid="menu-button"
            className={'border border-ink px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[.1em] text-ink ' + FOCUS_RING}>
            {open ? 'Close menu' : 'Menu'}
          </button>
        </div>
        <div id="phone-menu" hidden={!open} data-testid="phone-menu" className="border-b border-rule bg-white">
          <NavBar />
          <ActorBar />
        </div>
      </div>
    </>
  );
}
