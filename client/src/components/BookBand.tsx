import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchBook, dueInWords, LATE_RULE, type Book } from '../api/book';
import { BookConfidence } from '../pages/WarRoomPage';
import { FOCUS_RING } from './GovernedForm';

/**
 * S6 (LVRF_PLAN §25; Q7, D6; the approved mock-up's screen 3): the book's headline, once, at the top of Accounts home,
 * linking to the War Room. Counts only: no money (D1). Hypotheses due in words, and confirmed and refuted always
 * together, never refuted alone (Brad, 20 Nov 2026). On screen only.
 */
export function BookBand() {
  const { actor } = useActor();
  const [book, setBook] = useState<Book | 'error' | null>(null);
  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    fetchBook().then((r) => { if (!cancelled) setBook(r.status === 'ok' ? r.book : 'error'); });
    return () => { cancelled = true; };
  }, [actor]);
  const fig = 'text-silver';
  const b = book && book !== 'error' ? book.book : null;
  return (
    <div className="bg-ink text-offwhite print:hidden" role="region" aria-label="The book" data-testid="book-band">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-baseline gap-x-[22px] gap-y-1.5 px-4 py-3 text-[13px] sm:px-6">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-gold">The book</span>
        {book === null && <span className={fig}>loading…</span>}
        {book === 'error' && <span className={fig}>Couldn&apos;t load the book.</span>}
        {b && book !== 'error' && book && (b.account_count === 0
          ? <span data-testid="band-empty"><BookConfidence book={b} members={book.cohort_members} compact /></span>
          : <>
              <span data-testid="band-accounts"><b className="font-semibold">{b.account_count}</b> <span className={fig}>customer {b.account_count === 1 ? 'account' : 'accounts'}</span></span>
              <span data-testid="band-confidence"><span className={fig}>Book confidence</span> <BookConfidence book={b} members={book.cohort_members} compact /></span>
              <span data-testid="band-due"><span className={fig}>Hypotheses due</span> <b className="font-semibold">{dueInWords(b.hypotheses.due)}</b></span>
              <span data-testid="band-cr"><b className="font-semibold">{b.hypotheses.confirmed}</b> <span className={fig}>confirmed ·</span> <b className="font-semibold">{b.hypotheses.refuted}</b> <span className={fig}>refuted</span></span>
              <span data-testid="band-late"><b className="font-semibold">{b.outcomes.late}</b> <span className={fig}>late {b.outcomes.late === 1 ? 'outcome' : 'outcomes'} ({LATE_RULE})</span></span>
            </>)}
        <Link to="/book" className={'font-semibold text-gold underline underline-offset-2 sm:ml-auto ' + FOCUS_RING} data-testid="band-open">Open the War Room →</Link>
      </div>
    </div>
  );
}
