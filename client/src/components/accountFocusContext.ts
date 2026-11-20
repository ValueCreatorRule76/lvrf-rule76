import { createContext, useContext, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { FrameData } from '../lib/accountFrame';

/**
 * S5 (LVRF_PLAN §24): the account in focus, as pages and the frame read it. The provider is AccountFocus.tsx; this file
 * holds the context and its two hooks apart from it, so the provider's file exports a component only (fast refresh).
 */

/** What a page says about its own record. */
export type PageAccount =
  | { kind: 'loading' }
  /** No account of its own: the held focus is kept. */
  | { kind: 'none' }
  /** Its record belongs to this account; `belongs` names the record ("this run belongs to it"). */
  | { kind: 'account'; id: string; belongs?: string }
  /** Its record belongs to an account that cannot be named (a run whose account is retired): no frame on this page. */
  | { kind: 'unknown' };

export type FrameState = { status: 'none' } | { status: 'loading'; id: string } | { status: 'ok'; data: FrameData } | { status: 'error'; id: string };

export interface Notice { name: string; belongs?: string; from: { id: string; name: string } | null; at: string }

export interface FocusValue {
  focusId: string | null;
  frame: FrameState;
  /** This page's record belongs to an account that cannot be named: the frame stands aside on this page. */
  hidden: boolean;
  notice: Notice | null;
  /** The account's own page, opened from the frame, or "Back to …": set without a notice. */
  setFocus: (id: string) => void;
  leave: () => void;
  declare: (p: PageAccount) => void;
  /** Bumped after an act from the frame itself (D6's "Classify as…"), so the page below reads its record again. */
  pagesKey: number;
  reloadPages: () => void;
}

export const FocusContext = createContext<FocusValue | null>(null);

export function useAccountFocus(): FocusValue {
  const v = useContext(FocusContext);
  if (!v) throw new Error('useAccountFocus outside AccountFocusProvider');
  return v;
}

/**
 * A page says which account its own record belongs to. Run before paint (a layout effect), so a page's record is never
 * painted under another account's frame: the frame switches in the same frame the record first renders.
 */
export function useFrameAccount(p: PageAccount) {
  const { declare } = useAccountFocus();
  const key = p.kind === 'account' ? `account:${p.id}` : p.kind;
  const belongs = p.kind === 'account' ? p.belongs : undefined;
  const location = useLocation();
  useLayoutEffect(() => {
    if (p.kind === 'loading') return;
    declare(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, belongs, location.key, declare]);
}
