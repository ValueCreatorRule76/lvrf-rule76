import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { WROTE_EVENT } from '../api/http';
import { loadAccountFrame } from '../lib/accountFrame';
import { FocusContext, type FocusValue, type FrameState, type Notice, type PageAccount } from './accountFocusContext';

/**
 * S5 (LVRF_PLAN §24): the account in focus.
 *
 * D1: held PER TAB, in sessionStorage. Two tabs can hold two accounts. Nothing is stored on the server: no route, no
 * table, no act. Storage can be unavailable (a private window, blocked site data): every read and write is guarded,
 * and the frame then lasts as long as the page does.
 *
 * D2: a page whose own record belongs to an account FRAMES THAT ACCOUNT. When that replaces a held account, the frame
 * says so once ("You're now in …"); it never shows one account's record under another's frame. A page with no account
 * of its own (Runs, Packs, Policies, the Accounts home, a lineage row) keeps the held focus. "Leave" clears it.
 *
 * D4: the frame's facts are read when the account changes and again after any write (WROTE_EVENT), never on every
 * navigation.
 */

const KEY = 'lvrf:account-focus';
/** The held account's name, kept with it, so "… is no longer in focus" can name it after a page load. */
const NAME_KEY = 'lvrf:account-focus-name';
const readName = (id: string): string | null => {
  try { const v = JSON.parse(window.sessionStorage.getItem(NAME_KEY) ?? 'null') as { id: string; name: string } | null; return v && v.id === id ? v.name : null; } catch { return null; }
};
const writeName = (id: string, name: string) => { try { window.sessionStorage.setItem(NAME_KEY, JSON.stringify({ id, name })); } catch { /* storage unavailable */ } };
const readHeld = (): string | null => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const writeHeld = (id: string | null) => {
  try { if (id) window.sessionStorage.setItem(KEY, id); else { window.sessionStorage.removeItem(KEY); window.sessionStorage.removeItem(NAME_KEY); } } catch { /* storage unavailable: held for this page only */ }
};



export function AccountFocusProvider({ children }: { children: ReactNode }) {
  const { status } = useActor();
  const location = useLocation();
  const [focusId, setFocusId] = useState<string | null>(() => readHeld());
  const [frame, setFrame] = useState<FrameState>(() => { const h = readHeld(); return h ? { status: 'loading', id: h } : { status: 'none' }; });
  const [hiddenAt, setHiddenAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tick, setTick] = useState(0);
  const [pagesKey, setPagesKey] = useState(0);
  const reloadPages = useCallback(() => setPagesKey((n) => n + 1), []);
  const names = useRef(new Map<string, string>());
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  const apply = useCallback((id: string | null) => { writeHeld(id); setFocusId(id); }, []);

  // Signing out ends the focus: the next person to sign in in this tab starts with none.
  useEffect(() => { if (status === 'signed_out') { apply(null); setNotice(null); } }, [status, apply]);

  // The frame's reads: when the account changes, and after a write.
  useEffect(() => {
    if (!focusId) { setFrame({ status: 'none' }); return; }
    if (status !== 'signed_in') return;
    let cancelled = false;
    setFrame((f) => (f.status === 'ok' && f.data.id === focusId ? f : { status: 'loading', id: focusId }));
    loadAccountFrame(focusId).then((r) => {
      if (cancelled || focusRef.current !== focusId) return;
      if (r.status === 'ok') { names.current.set(focusId, r.data.name); writeName(focusId, r.data.name); setFrame({ status: 'ok', data: r.data }); }
      // Not this person's (another tenant's, or gone): the focus is dropped, not shown as an error.
      else if (r.status === 'not_found') apply(null);
      else setFrame({ status: 'error', id: focusId });
    });
    return () => { cancelled = true; };
  }, [focusId, status, tick, apply]);
  useEffect(() => {
    let t: number | undefined;
    const onWrote = () => { window.clearTimeout(t); t = window.setTimeout(() => setTick((n) => n + 1), 150); };
    window.addEventListener(WROTE_EVENT, onWrote);
    return () => { window.removeEventListener(WROTE_EVENT, onWrote); window.clearTimeout(t); };
  }, []);

  const declare = useCallback((p: PageAccount) => {
    if (p.kind === 'unknown') { setHiddenAt(location.key); return; }
    setHiddenAt(null);
    if (p.kind !== 'account') return;
    const held = focusRef.current;
    if (held === p.id) return;
    // D2: the page's own account wins, and the frame says so once, on this page only.
    setNotice(held ? { name: names.current.get(p.id) ?? '', belongs: p.belongs, from: { id: held, name: names.current.get(held) ?? readName(held) ?? '' }, at: location.key } : null);
    focusRef.current = p.id;
    apply(p.id);
  }, [apply, location.key]);

  const setFocus = useCallback((id: string) => { setNotice(null); setHiddenAt(null); focusRef.current = id; apply(id); }, [apply]);
  const leave = useCallback(() => { setNotice(null); setHiddenAt(null); focusRef.current = null; apply(null); }, [apply]);

  const value = useMemo<FocusValue>(() => ({
    focusId, frame, hidden: hiddenAt !== null && hiddenAt === location.key,
    // Said once: the notice belongs to the page that switched the frame, and is gone on the next.
    notice: notice && notice.at === location.key ? notice : null,
    setFocus, leave, declare, pagesKey, reloadPages,
  }), [focusId, frame, hiddenAt, notice, location.key, setFocus, leave, declare, pagesKey, reloadPages]);
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
