import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchRuns, type FetchRunsResult } from '../api/runsIndex';
import { useAccountFocus } from '../components/accountFocusContext';
import { FOCUS_RING } from '../components/GovernedForm';
import { RunsTable } from '../components/RunsTable';
import { AboutBatch, CreditErrataBatch, MisstatedFindingsBatch, SupersessionBatch, SystemExerciseBatch } from '../components/C3Batches';

export function RunsIndexPage() {
  const [result, setResult] = useState<FetchRunsResult | null>(null);
  // S5 (D3): with an account in focus, its runs; every account's are one click away, and the focus is kept.
  const { focusId, frame } = useAccountFocus();
  const [params] = useSearchParams();
  const all = params.get('all') === '1';
  const name = frame.status === 'ok' && frame.data.id === focusId ? frame.data.name : null;

  useEffect(() => {
    let cancelled = false;
    fetchRuns().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!result) return <p className="p-8 text-ink-45">loading</p>;

  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  return (
    // max-w-5xl (1024px): the runs table's seven columns (including badges
    // and an unwrapped ISO timestamp) don't wrap below ~700px, so this
    // leaves roughly 250-300px of headroom above that floor — room to
    // breathe without the edge-to-edge sprawl a fully unconstrained
    // container produced.
    <div className="mx-auto max-w-5xl px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF
        </span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
          Value runs
        </h1>
      </header>
      {focusId && (() => {
        const mine = result.runs.filter((r) => r.institution_id === focusId);
        const who = name ? `${name}'s` : "the account in focus's";
        const plural = (n: number) => (n === 1 ? 'run' : 'runs');
        return (
          <p className="m-0 mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-ink" data-testid="runs-filter" data-showing={all ? 'all' : 'focus'}>
            {all
              ? <><span>Showing every account&apos;s {result.runs.length} {plural(result.runs.length)}. {name ?? 'The account in focus'}&apos;s are marked.</span>
                  <Link to="/runs" className={'text-gold-ink underline ' + FOCUS_RING} data-testid="runs-show-focus">Show only {who} ({mine.length})</Link></>
              : <><span>Showing {who} {mine.length} {plural(mine.length)}.</span>
                  <Link to="/runs?all=1" className={'text-gold-ink underline ' + FOCUS_RING} data-testid="runs-show-all">Show every account&apos;s runs ({result.runs.length})</Link></>}
          </p>
        );
      })()}
      <RunsTable runs={focusId && !all ? result.runs.filter((r) => r.institution_id === focusId) : result.runs} focusId={all ? focusId : null} />
      {/* C3: the steward's two batches, each read first and submitted once with its count. */}
      <CreditErrataBatch />
      {/* B4 addendum: sealed findings their own seals contradict. */}
      <MisstatedFindingsBatch />
      <SystemExerciseBatch />
      {/* L41: the steward's batch; it shows only while a row waits. */}
      <AboutBatch />
      <SupersessionBatch />
    </div>
  );
}
