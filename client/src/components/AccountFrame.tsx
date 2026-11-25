import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccountFocus } from './accountFocusContext';
import { FOCUS_RING } from './GovernedForm';
import { ConfidenceBadge } from './workbench/Workspace';
import { ClassifyAccount } from './CreateAccountCard';
import { FRAME_REFERENCE_LABEL, FRAME_UNAVAILABLE, type FrameData } from '../lib/accountFrame';

/**
 * S5 (LVRF_PLAN §24; the D7 mock-ups as approved by Brad, 19 Nov 2026): the band under the header that carries the
 * account in focus through every page until it is left.
 *
 *   row 1   "In focus", the name (to its own page), the reference-example label; "Leave the account" at the right
 *           its pack (or "Unclassified" and, D6, "Classify as…"), its confidence NAMING ITS RUN, where it stands
 *   row 2   the account's pages: Workspace, Research, Runs (n), Value case, Point of view
 *
 * On screen only (print:hidden): the printed case and POV are S3's, untouched. NO MONEY in the frame. Below 640 px it
 * is one line, the name then "Pages ▸" (a real disclosure), with no sideways scroll. Classes are tokens only.
 */

const KICKER = 'text-[10.5px] font-semibold uppercase tracking-[.16em] text-gold-ink';
const PAGE_LINK = 'whitespace-nowrap border-b-2 pb-2 pt-1.5 text-[12px] font-semibold uppercase tracking-[.08em] no-underline ' + FOCUS_RING;
const LEAVE = 'whitespace-nowrap border border-ink bg-white px-3 py-[5px] text-[12.5px] font-semibold text-ink hover:bg-offwhite ' + FOCUS_RING;

type PageKey = 'workspace' | 'research' | 'runs' | 'case' | 'pov' | 'story' | null;

function currentPage(pathname: string, hash: string, id: string): PageKey {
  if (pathname === `/accounts/${id}`) return hash === '#research' ? 'research' : 'workspace';
  if (pathname === `/accounts/${id}/pov`) return 'pov';
  // S7b (§27): the story of record, the draft and the account's issued stories.
  if (pathname === `/accounts/${id}/story`) return 'story';
  if (/^\/runs\/[^/]+\/case$/.test(pathname)) return 'case';
  if (pathname === '/runs' || /^\/runs\/[^/]+$/.test(pathname)) return 'runs';
  return null;
}

interface PageItem { key: Exclude<PageKey, null>; label: string; to: string | null; off?: string }

function pagesOf(d: FrameData): PageItem[] {
  const items: PageItem[] = [{ key: 'workspace', label: d.self ? 'Account' : 'Workspace', to: `/accounts/${d.id}` }];
  // The tenant's own account has no research and no point of view (it is not worked as the path; D5).
  if (!d.self) items.push({ key: 'research', label: 'Research', to: `/accounts/${d.id}#research` });
  items.push({ key: 'runs', label: `Runs (${d.runs})`, to: '/runs' });
  items.push(d.confidence
    ? { key: 'case', label: 'Value case', to: `/runs/${d.confidence.run_id}/case` }
    : { key: 'case', label: 'Value case', to: null, off: 'Value case: none yet, no locked run' });
  if (!d.self) items.push({ key: 'pov', label: 'Point of view', to: `/accounts/${d.id}/pov` });
  if (!d.self) items.push({ key: 'story', label: 'Story', to: `/accounts/${d.id}/story` });
  return items;
}

function Meta({ d, onClassify, classifyOpen }: { d: FrameData; onClassify: () => void; classifyOpen: boolean }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-45" data-testid="frame-meta">
      {d.pack
        ? <span data-testid="frame-pack">{d.pack.name} pack</span>
        : <span data-testid="frame-pack">{d.self ? 'Not classified: your own account' : 'Unclassified: no industry pack'}</span>}
      {d.classifiable && (
        <button type="button" onClick={onClassify} aria-expanded={classifyOpen} aria-controls="frame-classify" data-testid="frame-classify-open"
          className={'border border-ink-70 bg-white px-2 py-px text-[11px] font-semibold uppercase tracking-[.1em] text-ink-70 hover:text-ink ' + FOCUS_RING}>
          Classify as…
        </button>
      )}
      <span aria-hidden="true">·</span>
      {d.confidence
        ? <span data-testid="frame-confidence">
            <span data-testid="frame-confidence-run">Latest locked run, run {d.confidence.run_number}:</span>{' '}
            <ConfidenceBadge score={d.confidence.score} band={d.confidence.band} />
            {d.confidence.erratum_line && <span className="ml-1.5 text-[11px] text-warning" data-testid="frame-erratum">{d.confidence.erratum_line}</span>}
          </span>
        : <span data-testid="frame-confidence">{d.no_confidence}</span>}
      <span aria-hidden="true">·</span>
      <span className="text-ink-70" data-testid="frame-standing">{d.standing}</span>
    </div>
  );
}

export function AccountFrame() {
  const { focusId, frame, hidden, notice, leave, setFocus, reloadPages } = useAccountFocus();
  const location = useLocation();
  const navigate = useNavigate();
  const [classifyOpen, setClassifyOpen] = useState(false);
  const phone = useRef<HTMLDetailsElement>(null);
  // A page change closes the phone panel and the classify form.
  useEffect(() => { if (phone.current) phone.current.open = false; setClassifyOpen(false); }, [location.pathname, location.hash]);
  // The frame closes "Classify as…" once the account is classified.
  const d = frame.status === 'ok' && frame.data.id === focusId ? frame.data : null;
  useEffect(() => { if (d && !d.classifiable) setClassifyOpen(false); }, [d]);
  if (!focusId || hidden) return null;
  const doLeave = () => { leave(); navigate('/'); };
  const shell = (body: ReactNode) => (
    <div className="border-b border-ink bg-white print:hidden" role="region" aria-label="Account in focus" data-testid="account-frame" data-account={focusId}>{body}</div>
  );
  if (!d) {
    // Never the previous account's facts while the new one is read: no name until this account's own reads arrive.
    return shell(
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6" data-testid="frame-pending">
        <span className={KICKER}>In focus</span>
        <span className="flex-1 text-[12.5px] text-ink-45" data-testid="frame-pending-text">{frame.status === 'error' ? FRAME_UNAVAILABLE : 'loading…'}</span>
        <button type="button" onClick={doLeave} className={LEAVE} data-testid="frame-leave">Leave the account</button>
      </div>,
    );
  }
  const here = currentPage(location.pathname, location.hash, d.id);
  const items = pagesOf(d);
  const nameLink = (cls: string) => (
    <Link to={`/accounts/${d.id}`} className={cls + ' ' + FOCUS_RING} data-testid="frame-name">{d.name}</Link>
  );
  const ref = d.reference && (
    <span className="border border-ink-70 px-2 py-px text-[12px] text-ink-70" data-testid="frame-reference">{FRAME_REFERENCE_LABEL}</span>
  );
  return (
    <>
      {shell(<>
        {/* 640 px and up: two rows. */}
        <div className="mx-auto hidden max-w-[1120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-7 gap-y-1.5 px-6 pt-3 sm:grid" data-testid="frame-desktop">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className={KICKER}>In focus</span>
              {nameLink('text-[16px] font-semibold text-ink no-underline hover:text-gold-ink')}
              {ref}
            </div>
            <Meta d={d} onClassify={() => setClassifyOpen(!classifyOpen)} classifyOpen={classifyOpen} />
          </div>
          <button type="button" onClick={doLeave} className={LEAVE} data-testid="frame-leave">Leave the account</button>
          <nav className="col-span-2 mt-1 flex flex-wrap gap-x-6" aria-label={`${d.name}'s pages`} data-testid="frame-pages">
            {items.map((it) => it.to
              ? <Link key={it.key} to={it.to} aria-current={here === it.key ? 'page' : undefined} data-page={it.key}
                  className={PAGE_LINK + (here === it.key ? ' border-gold text-ink' : ' border-transparent text-ink-70 hover:text-ink')}>{it.label}</Link>
              : <span key={it.key} data-page={it.key} data-off="true" className="whitespace-nowrap pb-2 pt-1.5 text-[12.5px] text-ink-45">{it.off}</span>)}
          </nav>
        </div>
        {/* Below 640 px: one line, the name then "Pages ▸". */}
        <details ref={phone} className="group sm:hidden" data-testid="frame-phone">
          <summary className={'flex cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 [&::-webkit-details-marker]:hidden ' + FOCUS_RING} data-testid="frame-phone-toggle">
            <span className={KICKER}>In focus</span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{d.name}</span>
            <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-[.08em] text-ink-70"><span className="group-open:hidden">Pages ▸</span><span className="hidden group-open:inline">Pages ▾</span></span>
          </summary>
          <div className="border-t border-rule-soft px-4 pb-3.5">
            {ref && <div className="mt-2.5">{ref}</div>}
            <div className="my-2.5"><Meta d={d} onClassify={() => setClassifyOpen(!classifyOpen)} classifyOpen={classifyOpen} /></div>
            <ul className="m-0 mb-3 list-none p-0" aria-label={`${d.name}'s pages`}>
              {items.map((it) => (
                <li key={it.key}>
                  {it.to
                    ? <Link to={it.to} aria-current={here === it.key ? 'page' : undefined} data-page={it.key}
                        className={'block border-b border-rule-soft py-[9px] text-[14px] text-ink no-underline ' + FOCUS_RING + (here === it.key ? ' pl-2.5 font-semibold shadow-[inset_3px_0_0_theme(colors.gold)]' : '')}>{it.label}</Link>
                    : <span data-page={it.key} data-off="true" className="block border-b border-rule-soft py-[9px] text-[14px] text-ink-45">{it.off}</span>}
                </li>
              ))}
            </ul>
            <button type="button" onClick={doLeave} className={LEAVE} data-testid="frame-leave">Leave the account</button>
          </div>
        </details>
        {/* D6: S1's component as it is, with its route, act and full confirmation unchanged. */}
        {d.classifiable && classifyOpen && (
          <div id="frame-classify" className="border-t border-rule-soft bg-offwhite" data-testid="frame-classify">
            <div className="mx-auto max-w-[1120px] px-4 py-3 sm:px-6">
              <div className="max-w-[640px] border border-rule bg-white px-4 py-3">
                <span className={KICKER}>Classify {d.name}</span>
                <ClassifyAccount institutionId={d.id} open onCancel={() => setClassifyOpen(false)} onDone={() => { setClassifyOpen(false); reloadPages(); }} />
              </div>
            </div>
          </div>
        )}
      </>)}
      {/* D2: said once, on the page that switched the frame. */}
      {notice && (
        <div className="border-b border-rule bg-rule-soft print:hidden" role="status" data-testid="frame-switched">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-baseline gap-x-4 gap-y-2 px-4 py-2.5 text-[13px] text-ink sm:px-6">
            <span>You&apos;re now in <strong className="font-semibold">{d.name}</strong>{notice.belongs ? `: ${notice.belongs}` : ''}. {notice.from ? `${notice.from.name || 'The account you were in'} is no longer in focus.` : ''}</span>
            {notice.from && (
              <button type="button" className={'text-[13px] font-semibold text-ink underline ' + FOCUS_RING} data-testid="frame-back"
                onClick={() => { const back = notice.from!.id; setFocus(back); navigate(`/accounts/${back}`); }}>
                Back to {notice.from.name || 'the account you were in'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
