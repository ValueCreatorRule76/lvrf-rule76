import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchBook, dueInWords, type Book, type BookAccount } from '../api/book';
import { fetchRuns } from '../api/runsIndex';
import { fetchGaps } from '../api/gaps';
import type { RunListItem } from '../types/runsIndex';
import type { CohortMember } from '../api/cohort';
import { loadBookRow, FRAME_UNAVAILABLE, type FrameData } from '../lib/accountFrame';
import { day } from '../lib/workspaceStatus';
import { STAGE_LABEL } from '../lib/labels';
import { MARKER_KIND } from '../api/pov';
import { useAccountFocus } from '../components/accountFocusContext';
import { ConfidenceBadge } from '../components/workbench/Workspace';
import { CohortCard } from '../components/CohortCard';
import { FOCUS_RING } from '../components/GovernedForm';

/**
 * S6 (3.1; LVRF_PLAN §25; the D8 mock-ups as approved by Brad, 20 Nov 2026): the War Room, `/book`.
 *
 * NO MONEY ON THIS PAGE, ANYWHERE (D1): not a total, not an average, not one account's own figure. Each figure in money
 * stays in its own value case, with its basis; a row says only whether that case states a cost of delay or refuses one,
 * and links to it (D3). Across the book: counts only. Book confidence is the weakest member, never an average.
 *
 * A row's run, score, next step and last recorded act come from the account frame's own derivation (loadBookRow), so
 * the War Room and the frame never say two things about one account; GET /api/book gives the rest.
 * The War Room has no account of its own: an account in focus (S5) is kept, and its row marked.
 */

type RowFacts = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: FrameData; last: { what: string; at: string } | null };

const UNMEASURED_WORDS: Record<string, string> = { no_engagement: 'has no engagement yet', never_run: 'has no run yet', no_locked_run: 'has no locked run' };

/** Book confidence, in words: the weakest member, never an average (cohort.ts). Shared by the tile and the band. */
export function BookConfidence({ book, members, compact = false }: { book: Book['book']; members: CohortMember[]; compact?: boolean }) {
  const c = book.confidence;
  if (c.floor === 'empty' || book.account_count === 0) {
    return <span data-testid="book-confidence" data-floor="empty">{compact ? 'No live customer engagements yet' : <><span className="block text-[15px] font-semibold text-ink">No live customer engagements yet.</span><span className="mt-1 block text-[12px] text-ink-45">The book counts customer accounts only.</span></>}</span>;
  }
  if (c.floor === 'unmeasured') {
    const unmeasured = [...new Map(members.filter((m) => m.status !== 'run_of_record').map((m) => [m.institution_id, m])).values()];
    const why = unmeasured.map((m) => `${m.institution_name} ${UNMEASURED_WORDS[m.status]}`).join('; ');
    return (
      <span data-testid="book-confidence" data-floor="unmeasured">
        <span className={compact ? 'font-semibold' : 'block text-[15px] font-semibold text-ink'}>Not measured</span>
        {!compact && <span className="mt-1 block text-[12px] text-ink-45">{why}.{c.lowest_recorded ? ` Lowest recorded: ${Number(c.lowest_recorded.confidence_score)} / 100, context only, not the book's score.` : ''}</span>}
      </span>
    );
  }
  const by = c.determined_by;
  // Compact (the band, on ink): the same words as the badge, "n / 100 · Band", as plain text.
  if (compact) return <span data-testid="book-confidence" data-floor="run" className="font-semibold">{Number(c.score)} / 100 · {c.band ? c.band.charAt(0).toUpperCase() + c.band.slice(1) : ''}</span>;
  return (
    <span data-testid="book-confidence" data-floor="run">
      <ConfidenceBadge score={c.score} band={c.band} />
      {!compact && by && <span className="mt-1 block text-[12px] text-ink-45">Set by {by.institution_name}, run {by.run_number}: the weakest member.</span>}
    </span>
  );
}

function Tile({ k, children, sub, wide = false, testid }: { k: string; children: ReactNode; sub?: ReactNode; wide?: boolean; testid: string }) {
  return (
    <div className={'min-w-0 border-b border-rule-soft px-4 py-3.5 sm:border-b-0 sm:border-r sm:last:border-r-0 ' + (wide ? 'col-span-2' : 'col-span-2 sm:col-span-1')} data-testid={testid}>
      <span className="block text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-45">{k}</span>
      <div className="mt-1.5 text-ink">{children}</div>
      {sub && <span className="mt-1 block text-[12px] text-ink-45">{sub}</span>}
    </div>
  );
}

const NUM = 'font-display text-[30px] leading-[1.05]';

function outcomeWords(o: BookAccount['outcomes']): { text: string; tone: 'warn' | 'plain' | 'muted' } {
  if (o.total === 0) return { text: 'No outcome yet', tone: 'muted' };
  const late = o.list.filter((x) => x.late);
  if (late.length > 0) return { text: `${late.length} late: promised ${day(late[0].promised_on!)}, no actual yet`, tone: 'warn' };
  const measured = o.list.filter((x) => x.measured_on).sort((a, b) => b.measured_on!.localeCompare(a.measured_on!));
  if (measured.length > 0) return { text: `Measured ${day(measured[0].measured_on!)}`, tone: 'plain' };
  const promised = o.list.filter((x) => x.promised_on).sort((a, b) => a.promised_on!.localeCompare(b.promised_on!));
  if (promised.length > 0) return { text: `Not yet due: promised ${day(promised[0].promised_on!)}`, tone: 'plain' };
  // D5 (Brad, 20 Nov 2026): never "on time" where nothing was promised.
  return { text: 'No promised date on record', tone: 'plain' };
}

function DelayCell({ facts, acct }: { facts: RowFacts; acct: BookAccount }) {
  if (facts.status !== 'ok') return <span className="text-ink-45">—</span>;
  const head = facts.data.confidence;
  if (!head) return <span className="text-ink-45" data-testid="row-delay" data-state="none">No case yet: no locked run</span>;
  const d = acct.cost_of_delay_by_run.find((x) => x.run_id === head.run_id);
  const link = (text: string, state: string) => (
    <Link to={`/runs/${head.run_id}/case`} data-testid="row-delay" data-state={state} className={'whitespace-normal font-semibold text-gold-ink underline underline-offset-2 ' + FOCUS_RING}>{text}</Link>
  );
  if (!d || d.state === 'not_sealed') return <span className="text-ink-45" data-testid="row-delay" data-state="not_sealed">Not sealed in run {head.run_number}&apos;s case</span>;
  if (d.state === 'stated') return link(`Stated in run ${head.run_number}'s case`, 'stated');
  return link(`Refused: ${d.reasons[0] ?? 'see the case'}`, 'refused');
}

function BookRow({ acct, facts, asks, runs, focused }: { acct: BookAccount; facts: RowFacts; asks: number | null | 'error'; runs: RunListItem[]; focused: boolean }) {
  const d = facts.status === 'ok' ? facts.data : null;
  const stage = d?.confidence ? runs.find((r) => r.id === d.confidence!.run_id)?.terminal_value_stage ?? null : null;
  const o = outcomeWords(acct.outcomes);
  const h = acct.hypotheses;
  const td = 'border-b border-rule-soft px-3 py-3 align-top';
  return (
    <tr data-testid="book-row" data-account={acct.institution_id} data-focus={focused ? 'true' : 'false'}>
      <td className={td + (focused ? ' shadow-[inset_3px_0_0_theme(colors.gold)]' : '')}>
        <Link to={`/accounts/${acct.institution_id}`} className={'text-[14px] font-semibold text-ink no-underline hover:text-gold-ink ' + FOCUS_RING} data-testid="book-row-name">{d?.name ?? '…'}</Link>
        {focused && <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-gold-ink" data-testid="book-row-focus">In focus</span>}
        {facts.status === 'error' && <span className="mt-0.5 block text-ink-45" data-testid="book-row-unavailable">{FRAME_UNAVAILABLE}</span>}
        {d && <span className="mt-0.5 block text-ink-45">{d.pack ? `${d.pack.name} pack` : 'Unclassified: no industry pack'}</span>}
        {d && <span className="mt-1.5 block text-ink-70" data-testid="book-row-standing">{d.standing}</span>}
      </td>
      <td className={td} data-testid="book-row-stage">{stage ? <span className="whitespace-nowrap border border-rule px-1.5 py-px text-[11px] font-semibold uppercase tracking-[.08em] text-ink-70">{STAGE_LABEL[stage] ?? stage}</span> : <span className="text-ink-45">{d ? 'No locked run' : '…'}</span>}</td>
      <td className={td} data-testid="book-row-confidence">{d ? (d.confidence ? <>Run {d.confidence.run_number}: <ConfidenceBadge score={d.confidence.score} band={d.confidence.band} /></> : <span className="text-ink-45">{d.no_confidence}</span>) : <span className="text-ink-45">loading…</span>}</td>
      <td className={td + ' whitespace-nowrap'} data-testid="book-row-due">{`${h.due.in30} · ${h.due.in60} · ${h.due.in90}`}{h.past_due_open > 0 && <span className="block text-warning">{h.past_due_open} past due</span>}</td>
      <td className={td + ' whitespace-nowrap'} data-testid="book-row-cr"><span className={h.refuted > 0 ? 'font-semibold text-critical' : ''}>{`${h.confirmed} · ${h.refuted}`}</span></td>
      <td className={td} data-testid="book-row-outcomes"><span className={o.tone === 'warn' ? 'font-semibold text-warning' : o.tone === 'muted' ? 'text-ink-45' : ''}>{o.text}</span></td>
      <td className={td} data-testid="book-row-asks">{asks === null ? <span className="text-ink-45">…</span> : asks === 'error' ? <span className="text-ink-45">{FRAME_UNAVAILABLE}</span> : acct.outcomes.total === 0 ? <span className="text-ink-45">—</span> : asks === 0 ? 'None' : asks}</td>
      <td className={td}><DelayCell facts={facts} acct={acct} /></td>
      <td className={td + ' text-ink-45'} data-testid="book-row-last">{facts.status === 'ok' ? (facts.last ? `${facts.last.what} · ${day(facts.last.at)}` : 'Nothing recorded yet') : ''}</td>
    </tr>
  );
}

function BookCard({ acct, facts, asks, runs, focused }: { acct: BookAccount; facts: RowFacts; asks: number | null | 'error'; runs: RunListItem[]; focused: boolean }) {
  const d = facts.status === 'ok' ? facts.data : null;
  const stage = d?.confidence ? runs.find((r) => r.id === d.confidence!.run_id)?.terminal_value_stage ?? null : null;
  const h = acct.hypotheses;
  const dt = 'text-ink-45'; const dd = 'm-0';
  return (
    <div className={'mb-2.5 border border-rule bg-white px-4 py-3.5' + (focused ? ' shadow-[inset_3px_0_0_theme(colors.gold)]' : '')} data-testid="book-card" data-account={acct.institution_id}>
      <Link to={`/accounts/${acct.institution_id}`} className={'text-[15px] font-semibold text-ink no-underline ' + FOCUS_RING}>{d?.name ?? '…'}</Link>
      {focused && <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-[.1em] text-gold-ink">In focus</span>}
      {d && <span className="mt-0.5 block text-[12.5px] text-ink-45">{d.pack ? `${d.pack.name} pack` : 'Unclassified: no industry pack'} · {d.standing}</span>}
      <dl className="mt-2.5 grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className={dt}>Confidence</dt><dd className={dd}>{d ? (d.confidence ? <>Run {d.confidence.run_number}: <ConfidenceBadge score={d.confidence.score} band={d.confidence.band} /></> : d.no_confidence) : '…'}</dd>
        <dt className={dt}>Stage reached</dt><dd className={dd}>{stage ? STAGE_LABEL[stage] ?? stage : 'No locked run'}</dd>
        <dt className={dt}>Hypotheses due</dt><dd className={dd}>{dueInWords(h.due)}</dd>
        <dt className={dt}>Confirmed · refuted</dt><dd className={dd}>{h.confirmed} confirmed · {h.refuted} refuted</dd>
        <dt className={dt}>Outcomes</dt><dd className={dd}>{outcomeWords(acct.outcomes).text}</dd>
        <dt className={dt}>Open asks</dt><dd className={dd}>{asks === null ? '…' : asks === 'error' ? FRAME_UNAVAILABLE : acct.outcomes.total === 0 ? '—' : asks === 0 ? 'None' : asks}</dd>
        <dt className={dt}>Cost of delay</dt><dd className={dd}><DelayCell facts={facts} acct={acct} /></dd>
        <dt className={dt}>Last recorded</dt><dd className={dd}>{facts.status === 'ok' ? (facts.last ? `${facts.last.what} · ${day(facts.last.at)}` : 'Nothing recorded yet') : ''}</dd>
      </dl>
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { claimed: 'claimed', measured: 'measured', verified: 'verified', not_realized: 'not realized' };

export function WarRoomPage() {
  const { actor } = useActor();
  const { focusId } = useAccountFocus();
  const [book, setBook] = useState<Book | { error: string } | null>(null);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [facts, setFacts] = useState<Record<string, RowFacts>>({});
  const [asks, setAsks] = useState<Record<string, number | 'error'>>({});

  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    Promise.all([fetchBook(), fetchRuns()]).then(([b, r]) => {
      if (cancelled) return;
      if (b.status !== 'ok') { setBook({ error: b.message }); return; }
      const list = r.status === 'ok' ? r.runs : [];
      setBook(b.book); setRuns(list);
      for (const a of b.book.accounts) {
        loadBookRow(a.institution_id, list).then((x) => { if (!cancelled) setFacts((f) => ({ ...f, [a.institution_id]: x })); });
        // Open asks: each outcome's gap register, by its own route (one implementation of the rule).
        Promise.all(a.outcomes.list.map((o) => fetchGaps(o.id))).then((gs) => {
          if (cancelled) return;
          setAsks((s) => ({ ...s, [a.institution_id]: gs.some((g) => g.status !== 'ok') ? 'error' : gs.reduce((n, g) => n + (g.status === 'ok' ? g.gaps.length : 0), 0) }));
        });
      }
    });
    return () => { cancelled = true; };
  }, [actor]);

  if (!book) return <p className="p-8 text-ink-45">loading</p>;
  if ('error' in book) return <p className="p-8 text-ink-70" data-testid="book-error">{book.error}</p>;
  const b = book.book;
  const factsOf = (id: string): RowFacts => facts[id] ?? { status: 'loading' };
  const asksOf = (a: BookAccount) => (a.outcomes.list.length === 0 ? 0 : asks[a.institution_id] ?? null);
  const gap = b.confirmation_gap;
  const statusLine = Object.entries(b.outcomes.by_status).map(([k, n]) => `${n} ${STATUS_WORD[k] ?? k}`).join(' · ');
  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-6 sm:px-6" data-testid="war-room">
      <header className="flex flex-wrap items-end gap-x-7 gap-y-2">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[.16em] text-ink-45">The book</span>
          <h1 className="m-0 font-display text-[34px] leading-none tracking-[.02em] sm:text-[44px]">War Room</h1>
        </div>
        <p className="m-0 pb-1 text-[12.5px] text-ink-45">Live customer accounts only · as of {day(`${book.as_of}T00:00:00Z`)} · read only</p>
      </header>

      <div className="mt-[18px] grid grid-cols-2 border border-rule bg-white sm:grid-cols-6" data-testid="book-tiles">
        <Tile k="In the book" testid="tile-accounts" sub="customer accounts"><span className={NUM}>{b.account_count}</span></Tile>
        <Tile k="Book confidence · weakest member" wide testid="tile-confidence"><BookConfidence book={b} members={book.cohort_members} /></Tile>
        <Tile k="Hypotheses due" testid="tile-due" sub={b.hypotheses.past_due_open > 0 ? `${b.hypotheses.past_due_open} past due, still open` : undefined}>
          <span className="text-[15px] font-semibold">{b.account_count === 0 ? '—' : dueInWords(b.hypotheses.due)}</span>
        </Tile>
        <Tile k="Confirmed · refuted" testid="tile-cr" sub={b.account_count === 0 ? undefined : `${b.hypotheses.open} open`}>
          <span className="text-[15px] font-semibold">{b.account_count === 0 ? '—' : `${b.hypotheses.confirmed} confirmed · ${b.hypotheses.refuted} refuted`}</span>
        </Tile>
        <Tile k="Late outcomes" testid="tile-late" sub={b.account_count === 0 ? undefined : `${b.outcomes.no_promised_date} with no promised date on record`}>
          <span className={NUM}>{b.account_count === 0 ? '—' : b.outcomes.late}</span>
        </Tile>
      </div>
      {b.account_count > 0 && (
        <p className="m-0 mt-2 text-[12.5px] text-ink-45" data-testid="book-status-line">
          Outcomes by status: {statusLine || 'none yet'}. Counts only: the War Room never sums or averages money across accounts.
        </p>
      )}

      {b.account_count === 0 ? (
        <div className="mt-[18px] border border-rule bg-white px-5 py-4 text-[14px]" data-testid="book-empty-note">
          No live customer engagements yet. When the first customer account is opened, it appears here, with its runs and hypotheses.
        </div>
      ) : (
        <>
          <div className="mt-[18px] hidden sm:block">
            <table className="w-full border-collapse border border-rule bg-white text-[12.5px]" data-testid="book-table">
              <thead>
                <tr>
                  {['Account', 'Stage reached', 'Confidence', 'Hypotheses due 30 · 60 · 90 days', 'Confirmed · refuted', 'Outcomes', 'Open asks', 'Cost of delay', 'Last recorded'].map((t) => (
                    <th key={t} className="border-b border-silver px-3 py-[9px] text-left align-bottom text-[10px] font-semibold uppercase tracking-[.13em] text-ink-45">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.accounts.map((a) => <BookRow key={a.institution_id} acct={a} facts={factsOf(a.institution_id)} asks={asksOf(a)} runs={runs} focused={a.institution_id === focusId} />)}
              </tbody>
            </table>
          </div>
          <div className="mt-4 sm:hidden" data-testid="book-cards">
            {book.accounts.map((a) => <BookCard key={a.institution_id} acct={a} facts={factsOf(a.institution_id)} asks={asksOf(a)} runs={runs} focused={a.institution_id === focusId} />)}
          </div>
        </>
      )}

      {/* D4: the confirmation gap's count and refusal only. */}
      <section className="mt-3.5 border border-l-[3px] border-rule border-l-ink-45 bg-white px-5 py-4" data-testid="confirmation-gap">
        <span className="block text-[11px] font-semibold uppercase tracking-[.16em] text-ink-45">The confirmation gap</span>
        <p className="m-0 mt-1 text-[15px] font-semibold text-ink" data-testid="confirmation-gap-state">
          {gap.admissible < gap.needs
            ? `Not reported: ${gap.admissible} verified ${gap.admissible === 1 ? 'outcome' : 'outcomes'} in the book; it needs ${gap.needs}.`
            : `${gap.admissible} verified outcomes in the book: enough to report it. The figure itself is a later item.`}
        </p>
        <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">
          How far results land from what was committed, across the book. It is not reported over fewer than {gap.needs} verified outcomes, and its spread not below {gap.dispersion_needs}. A measured but unverified result earns no credit.
        </p>
      </section>

      {/* D6: the per-industry detail of book confidence, moved here from the Accounts home. */}
      <div className="mt-6"><CohortCard n="" detail /></div>

      {/* D2: not in the book, never counted. */}
      <section className="mt-8" data-testid="not-in-book">
        <h2 className="m-0 font-display text-[24px] font-normal tracking-[.02em]">Not in the book</h2>
        <p className="m-0 mb-2.5 text-[12.5px] text-ink-45">Never counted in any figure above. Each is linked to its own account.</p>
        {book.not_in_book.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">None.</p> : (
          <ul className="m-0 list-none border border-rule bg-white p-0">
            {book.not_in_book.map((x) => (
              <li key={x.institution_id} className="grid grid-cols-1 gap-0.5 border-b border-rule-soft px-4 py-3 last:border-b-0 sm:grid-cols-[1.4fr_2.6fr_auto] sm:items-baseline sm:gap-3.5 sm:px-5" data-testid="not-in-book-row" data-reason={x.reason}>
                <span className="font-semibold text-ink">{x.name}</span>
                <span className="text-[12.5px]">{x.reason === 'own_account'
                  ? "Your own company's account: measured, but never ranked against your customers"
                  : `A reference example${x.marker_kind && MARKER_KIND[x.marker_kind as keyof typeof MARKER_KIND] ? ` (${MARKER_KIND[x.marker_kind as keyof typeof MARKER_KIND].label.toLowerCase()})` : ''}, not a customer engagement`}</span>
                <Link to={`/accounts/${x.institution_id}`} className={'text-[13px] font-semibold text-gold-ink underline ' + FOCUS_RING}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
